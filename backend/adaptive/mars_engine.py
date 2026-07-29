"""
MARS engine adapted for programming (coding) adaptive practice.

Based on Autograder/mars/mars_experiments_0.py (MARSModel). Adapted:
  * Learner rating starts at 0 (per product decision). The Elo math needs the
    learner and item ratings on the SAME scale, so item ratings are shifted down
    by RATING_SHIFT (1500): effective_item_rating = elo - 1500. A brand-new
    learner at 0 therefore faces a ~1500-Elo item as an "even" (E≈0.5) match.
  * Response quality comes from CODING signals: fraction of test cases passed,
    time taken vs the question's reference time, and number of run attempts
    (instead of MCQ correctness + hint count).
  * A skip is treated as a miss (S=0) with a reduced K (small penalty).
  * The per-question rating change is hard-clamped to +/- MAX_JUMP (50).

The engine is stateless-ish: it reads/writes a MarsRating row. Config mirrors
default_config() from the reference implementation.
"""
import math

RATING_SHIFT = 1500.0     # item elo → learner space (learner starts at 0)
MAX_JUMP = 50.0           # hard clamp on per-question rating change (requested)
ROLLING_WINDOW = 20

CFG = {
    "k_max": 45.0,
    "k_min": 12.0,
    "n_prov": 30,          # provisional period → higher K early
    "lambda_n": 0.015,
    "sigma2_0": 100.0,

    # response-quality weights (coding): time, pass-ratio, attempts
    "w_time": 0.40,
    "w_pass": 0.45,
    "w_attempts": 0.15,
    "time_slack_ratio": 0.15,
    "default_ref_time_sec": 180.0,
    "max_run_attempts": 6.0,

    # streak
    "pos_thr": 3,
    "neg_thr": 3,
    "streak_k_max": 7,
    "phi_max": 0.35,
    "phi_shield": 0.35,

    # momentum
    "beta_min": 0.02,
    "beta_max": 0.20,
    "v_max": 30.0,

    # rapid-guess cap (very fast correct → capped gain)
    "rapid_guess_enabled": True,
    "rapid_threshold_ratio": 0.20,
    "rapid_cap_ratio": 0.20,

    # skip penalty (skips update with a reduced K)
    "skip_k_ratio": 0.35,

    # Failure damping: a wrong/partial SUBMIT should not tank the rating.
    # Negative deltas are scaled by this, and a soft cap limits the drop.
    "fail_damping": 0.35,
    "fail_soft_cap": 12.0,
}


def _sigma2(rolling):
    if not rolling or len(rolling) < 2:
        return 100.0
    n = len(rolling)
    mean = sum(rolling) / n
    return sum((x - mean) ** 2 for x in rolling) / n


def expected_prob(learner_rating, effective_item_rating):
    return 1.0 / (1.0 + 10.0 ** ((effective_item_rating - learner_rating) / 400.0))


def _k_factor(n, sigma2):
    if n < CFG["n_prov"]:
        return CFG["k_max"]
    return (
        CFG["k_min"]
        + (CFG["k_max"] - CFG["k_min"])
        * math.exp(-CFG["lambda_n"] * (n - CFG["n_prov"]))
        * (sigma2 / (sigma2 + CFG["sigma2_0"]))
    )


def _streak_phi(streak):
    kmax = CFG["streak_k_max"]
    if streak >= CFG["pos_thr"]:
        return 1.0 + CFG["phi_max"] * ((streak - CFG["pos_thr"]) / max(1, kmax - CFG["pos_thr"]))
    if streak <= -CFG["neg_thr"]:
        return 1.0 - CFG["phi_shield"] * ((abs(streak) - CFG["neg_thr"]) / max(1, kmax - CFG["neg_thr"]))
    return 1.0


def _response_quality_factor(pass_ratio, time_taken, ref_time, run_attempts):
    """
    Coding response quality → a modifier in ~[0.85, 1.15] on the update
    magnitude (mirrors the reference response_quality_factor but with coding
    signals). quality=0 → 0.85x, quality=1 → 1.15x.
    """
    ref = float(ref_time) if ref_time and ref_time > 0 else CFG["default_ref_time_sec"]
    tspent = float(time_taken) if time_taken and time_taken > 0 else ref
    slack = CFG["time_slack_ratio"] * ref
    tau = max(0.0, min(1.0, (ref - tspent + slack) / max(1e-6, ref)))   # faster → higher

    attempts = max(1.0, float(run_attempts or 1))
    att_q = max(0.0, min(1.0, 1.0 - (attempts - 1.0) / max(1.0, CFG["max_run_attempts"] - 1.0)))

    pr = max(0.0, min(1.0, float(pass_ratio)))

    quality = CFG["w_time"] * tau + CFG["w_pass"] * pr + CFG["w_attempts"] * att_q
    quality = max(0.0, min(1.0, quality))
    return 0.85 + 0.30 * quality


def _beta(n, sigma2):
    if n < CFG["n_prov"]:
        return CFG["beta_min"]
    nu = sigma2 / (sigma2 + CFG["sigma2_0"])
    return CFG["beta_min"] + (CFG["beta_max"] - CFG["beta_min"]) * (1.0 - nu)


def update_rating(mars, question, *, outcome, pass_ratio, time_taken, run_attempts):
    """
    Apply one MARS update to a MarsRating row (mutates it, caller saves).

    outcome: 'solved' | 'failed' | 'skipped'
    Returns dict(delta, rating_before, rating_after).

    S (binary correctness) = 1 only if solved (all tests passed). pass_ratio
    still feeds the response-quality factor for partial credit shaping.
    """
    rating_before = mars.rating
    rolling = list(mars.rolling_updates or [])
    sigma2 = _sigma2(rolling)

    eff_item = float(question.elo_rating) - RATING_SHIFT
    E = expected_prob(mars.rating, eff_item)

    solved = (outcome == 'solved')
    skipped = (outcome == 'skipped')
    S = 1 if solved else 0

    K = _k_factor(mars.n, sigma2)
    if skipped:
        K *= CFG["skip_k_ratio"]        # smaller penalty for skipping
    phi = _streak_phi(mars.streak)

    if skipped:
        q_factor = 1.0
    else:
        q_factor = _response_quality_factor(pass_ratio, time_taken, question.ref_time_sec, run_attempts)

    delta_raw = K * phi * q_factor * (S - E)

    # Rapid-correct cap: very fast full solve → cap the gain.
    if CFG["rapid_guess_enabled"] and solved and time_taken and question.ref_time_sec:
        if float(time_taken) < CFG["rapid_threshold_ratio"] * float(question.ref_time_sec):
            delta_raw = min(delta_raw, CFG["rapid_cap_ratio"] * CFG["k_min"])

    # Momentum (heavy-ball), velocity clipped.
    beta = _beta(mars.n, sigma2)
    velocity = beta * float(mars.velocity or 0.0) + delta_raw
    velocity = max(-CFG["v_max"], min(CFG["v_max"], velocity))

    # Hard clamp on the applied jump (requested: never more than +/- 50).
    applied = max(-MAX_JUMP, min(MAX_JUMP, velocity))

    # Failure damping: a wrong/partial answer should only nudge the rating down,
    # not tank it. Scale negative deltas and soft-cap the drop. (Gains keep full
    # magnitude so solving still feels rewarding.)
    if applied < 0:
        applied *= CFG["fail_damping"]
        applied = max(applied, -CFG["fail_soft_cap"])

    new_rating = rating_before + applied

    # ---- bookkeeping (mirror LearnerState.update_bookkeeping) ----
    mars.rating = round(new_rating, 2)
    mars.velocity = round(velocity, 4)
    mars.peak_rating = max(mars.peak_rating, mars.rating)

    if not skipped:
        mars.n += 1
        if solved:
            mars.streak = mars.streak + 1 if mars.streak >= 0 else 1
        else:
            mars.streak = mars.streak - 1 if mars.streak <= 0 else -1
        for tag in (question.tags or []) or ['unknown']:
            mars.topic_total[tag] = mars.topic_total.get(tag, 0) + 1
            if solved:
                mars.topic_correct[tag] = mars.topic_correct.get(tag, 0) + 1
    else:
        # A skip nudges the streak negative but doesn't count as an answer.
        mars.streak = mars.streak - 1 if mars.streak <= 0 else -1

    rolling.append(round(applied, 4))
    mars.rolling_updates = rolling[-ROLLING_WINDOW:]

    return {
        "delta": round(applied, 2),
        "rating_before": round(rating_before, 2),
        "rating_after": round(mars.rating, 2),
    }


# ---------------------------------------------------------------------------
# Recommendation: pick the next question (difficulty match + weak-topic bonus +
# velocity alignment), avoiding already-served questions in this session.
# ---------------------------------------------------------------------------

def _behavioral_target(mars):
    """hot/steady/cold → shift the target rating (MARS graph-aware recommend)."""
    streak = mars.streak
    if streak >= CFG["pos_thr"]:
        return 60.0     # doing well → push harder
    if streak <= -CFG["neg_thr"]:
        return -60.0    # struggling → ease off
    return 0.0


def score_candidate(mars, question, served_ids):
    """Utility of serving `question` to learner `mars` (higher = better)."""
    target = mars.rating + _behavioral_target(mars)
    eff_item = float(question.elo_rating) - RATING_SHIFT

    # difficulty match: closeness of item to the (behaviour-shifted) target.
    diff = abs(eff_item - target)
    difficulty_match = 1.0 - min(1.0, diff / 400.0)

    # weak-topic bonus: prefer topics where the learner is weak.
    weak_bonus = 0.0
    for tag in (question.tags or []):
        total = mars.topic_total.get(tag, 0)
        if total >= 2:
            acc = mars.topic_correct.get(tag, 0) / total
            weak_bonus = max(weak_bonus, 1.0 - acc)

    # velocity alignment: if rating is rising, slightly prefer harder items.
    v = float(mars.velocity or 0.0)
    velo_align = 0.0
    if v > 0.5 and eff_item >= mars.rating:
        velo_align = 0.15
    elif v < -0.5 and eff_item <= mars.rating:
        velo_align = 0.15

    return 0.70 * difficulty_match + 0.15 * weak_bonus + velo_align
