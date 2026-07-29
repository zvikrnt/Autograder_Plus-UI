#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
MARS Experiments
Momentum-Aware Dynamic Adaptive Rating System for Adaptive Assessment

Run examples:

python mars_experiments.py \
  --mode online \
  --data data/assistments2009.csv \
  --out results/assistments_online

python mars_experiments.py \
  --mode ablation \
  --data data/assistments2009.csv \
  --out results/assistments_ablation

python mars_experiments.py \
  --mode simulate \
  --out results/simulation \
  --n_learners 2000 \
  --n_items 1500 \
  --steps 80
"""

import argparse
import math
import os
import random
import re
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path
from tkinter.filedialog import test

import networkx as nx
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, roc_auc_score
from tqdm import tqdm


# ---------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------

def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)


def ensure_dir(path):
    Path(path).mkdir(parents=True, exist_ok=True)


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def export_latex_table(df, path, caption="Results", label="tab:results"):
    tex = df.to_latex(index=False, escape=False)
    tex = tex.replace(
        "\\begin{tabular}",
        f"\\begin{{table}}[t]\n\\centering\n\\caption{{{caption}}}\n\\label{{{label}}}\n\\begin{{tabular}}"
    )
    tex = tex.replace("\\end{tabular}", "\\end{tabular}\n\\end{table}")
    with open(path, "w", encoding="utf-8") as f:
        f.write(tex)


# ---------------------------------------------------------------------
# Robust CSV reader
# ---------------------------------------------------------------------

def read_csv_robust(path, max_rows=None):
    """
    Robust CSV reader for public datasets such as ASSISTments.
    Handles encoding issues like:
    UnicodeDecodeError: 'utf-8' codec can't decode bytes...
    """

    encodings = ["utf-8", "utf-8-sig", "latin1", "ISO-8859-1", "cp1252"]
    last_error = None

    for enc in encodings:
        try:
            print(f"Trying encoding: {enc}")
            return pd.read_csv(
                path,
                nrows=max_rows,
                low_memory=False,
                encoding=enc,
                encoding_errors="replace",
                on_bad_lines="skip"
            )
        except UnicodeDecodeError as e:
            last_error = e
            print(f"Failed with encoding: {enc}")

    raise last_error


# ---------------------------------------------------------------------
# Dataset loading and normalization
# ---------------------------------------------------------------------

COLUMN_ALIASES = {
    "user_id": [
        "user_id", "user id", "student_id", "student id",
        "anon_student_id", "anon student id", "uid", "user"
    ],
    "item_id": [
        "problem_id", "problem id", "item_id", "item id",
        "question_id", "question id", "assistment_id",
        "assistment id", "assessment_item_id", "problem"
    ],
    "skill_id": [
        "skill_id", "skill id", "skill", "skill_name", "skill name",
        "kc", "kc_default", "kc(default)", "knowledge_component",
        "tags", "concept_id", "concept id"
    ],
    "correct": [
        "correct", "is_correct", "answer_correct",
        "answered_correctly", "correctness"
    ],
    "timestamp": [
        "timestamp", "time", "start_time", "start time",
        "created_at", "order_id", "order id", "order",
        "log_id", "problem_log_id"
    ],
    "response_time_ms": [
        "ms_first_response", "ms first response",
        "first_response_time", "first response time",
        "elapsed_time", "elapsed time",
        "response_time", "response time",
        "prior_question_elapsed_time"
    ],
    "hint_count": [
        "hint_count", "hint count", "hints", "hint",
        "number_of_hints", "num_hints", "bottom_hint", "bottom hint"
    ],
    "attempt_count": [
        "attempt_count", "attempt count", "attempts", "num_attempts"
    ],
    "item_type": [
        "answer_type", "answer type", "type",
        "question_type", "question type"
    ],
    "marks": [
        "marks", "score", "points", "max_score"
    ],
}


def normalize_column_name(col):
    col = str(col).strip().lower()
    col = col.replace("-", "_").replace("/", "_")
    col = re.sub(r"\s+", "_", col)
    col = col.replace("__", "_")
    return col


def find_column(columns, canonical_name):
    normalized = {normalize_column_name(c): c for c in columns}

    for alias in COLUMN_ALIASES[canonical_name]:
        alias_norm = normalize_column_name(alias)
        if alias_norm in normalized:
            return normalized[alias_norm]

    for original in columns:
        n = normalize_column_name(original)

        if canonical_name == "user_id" and ("student" in n or "user" in n):
            return original

        if canonical_name == "item_id" and ("problem" in n or "question" in n or "item" in n):
            return original

        if canonical_name == "skill_id" and ("skill" in n or "kc" in n or "concept" in n):
            return original

    return None


def clean_skill_value(value):
    if pd.isna(value):
        return "unknown"

    value = str(value).strip()

    if not value:
        return "unknown"

    for sep in ["~~", ";", ",", "|"]:
        if sep in value:
            parts = [p.strip() for p in value.split(sep) if p.strip()]
            return parts[0] if parts else "unknown"

    return value


def load_public_dataset(path, max_rows=None):
    """
    Loads ASSISTments or similar public student-response CSV.
    Normalizes columns into:
    user_id, item_id, skill_id, correct, timestamp,
    response_time_sec, hint_count, attempt_count, item_type, marks
    """

    raw = read_csv_robust(path, max_rows=max_rows)

    print("Dataset loaded successfully.")
    print(f"Raw shape: {raw.shape}")
    print("Available columns:")
    print(list(raw.columns))

    df = pd.DataFrame()

    for canonical in COLUMN_ALIASES.keys():
        col = find_column(raw.columns, canonical)
        if col is not None:
            df[canonical] = raw[col]
            print(f"Mapped {canonical} -> {col}")
        else:
            df[canonical] = np.nan
            print(f"Missing optional column: {canonical}")

    required = ["user_id", "item_id", "correct"]
    missing = [c for c in required if df[c].isna().all()]

    if missing:
        raise ValueError(
            f"Missing required columns after mapping: {missing}. "
            f"Please check dataset column names."
        )

    df["user_id"] = df["user_id"].astype(str)
    df["item_id"] = df["item_id"].astype(str)
    df["skill_id"] = df["skill_id"].apply(clean_skill_value).astype(str)

    df["correct"] = pd.to_numeric(df["correct"], errors="coerce")
    df = df[df["correct"].isin([0, 1])].copy()
    df["correct"] = df["correct"].astype(int)

    if df["timestamp"].isna().all():
        df["timestamp"] = np.arange(len(df))
    else:
        ts = pd.to_numeric(df["timestamp"], errors="coerce")
        if ts.notna().mean() > 0.80:
            df["timestamp"] = ts
        else:
            df["timestamp"] = pd.factorize(df["timestamp"])[0]

    df["response_time_sec"] = pd.to_numeric(
        df["response_time_ms"], errors="coerce"
    ) / 1000.0

    median_time = df["response_time_sec"].median(skipna=True)

    if pd.notna(median_time) and median_time > 3600:
        df["response_time_sec"] = df["response_time_sec"] / 1000.0

    df["hint_count"] = pd.to_numeric(
        df["hint_count"], errors="coerce"
    ).fillna(0).clip(lower=0)

    df["attempt_count"] = pd.to_numeric(
        df["attempt_count"], errors="coerce"
    ).fillna(1).clip(lower=1)

    df["marks"] = pd.to_numeric(
        df["marks"], errors="coerce"
    ).fillna(1)

    df["item_type"] = df["item_type"].fillna("unknown").astype(str)

    df = df.sort_values(["user_id", "timestamp"]).reset_index(drop=True)

    keep_cols = [
        "user_id", "item_id", "skill_id", "correct", "timestamp",
        "response_time_sec", "hint_count", "attempt_count",
        "item_type", "marks"
    ]

    df = df[keep_cols]

    print(f"Normalized shape: {df.shape}")
    print(f"Users: {df['user_id'].nunique()}")
    print(f"Items: {df['item_id'].nunique()}")
    print(f"Skills: {df['skill_id'].nunique()}")

    return df


def filter_min_interactions(df, min_user_interactions=5):
    counts = df.groupby("user_id").size()
    keep_users = counts[counts >= min_user_interactions].index
    df = df[df["user_id"].isin(keep_users)].copy()
    df = df.reset_index(drop=True)
    return df


def chronological_split_by_user(df, test_ratio=0.2):
    train_parts = []
    test_parts = []

    for _, group in df.groupby("user_id", sort=False):
        group = group.sort_values("timestamp")
        n = len(group)

        if n < 2:
            train_parts.append(group)
            continue

        n_test = max(1, int(round(n * test_ratio)))
        split = max(1, n - n_test)

        train_parts.append(group.iloc[:split])
        test_parts.append(group.iloc[split:])

    train = pd.concat(train_parts, ignore_index=True)

    if test_parts:
        test = pd.concat(test_parts, ignore_index=True)
    else:
        test = pd.DataFrame(columns=df.columns)

    return train, test


# ---------------------------------------------------------------------
# Item difficulty and graph construction
# ---------------------------------------------------------------------

def estimate_item_table(train, center=1500.0, scale=400.0):
    item = train.groupby("item_id").agg(
        n=("correct", "size"),
        p_correct=("correct", "mean"),
        skill_id=("skill_id", lambda x: x.mode().iloc[0] if len(x.mode()) else "unknown"),
        marks=("marks", "median"),
        item_type=("item_type", lambda x: x.mode().iloc[0] if len(x.mode()) else "unknown"),
        tref=("response_time_sec", "median"),
    ).reset_index()

    global_p = train["correct"].mean()
    alpha = 3.0

    item["p_smooth"] = (
        item["p_correct"] * item["n"] + global_p * alpha
    ) / (item["n"] + alpha)

    p = item["p_smooth"].clip(1e-4, 1.0 - 1e-4)

    # Higher correctness means easier item, therefore lower item rating.
    item["item_rating"] = center - scale * np.log(p / (1.0 - p))

    item["tref"] = (
        item["tref"]
        .fillna(item["tref"].median())
        .fillna(60.0)
        .clip(lower=5.0, upper=600.0)
    )

    return item


def build_question_graph(
    train,
    item_table,
    same_skill_k=3,
    transition_min_count=3,
    max_nodes_for_betweenness=5000,
    betweenness_sample=1000,
    seed=42
):
    G = nx.DiGraph()
    item_table = item_table.copy()

    for row in item_table.itertuples(index=False):
        G.add_node(
            row.item_id,
            skill_id=row.skill_id,
            item_rating=float(row.item_rating),
            tref=float(row.tref),
            marks=float(row.marks),
            item_type=str(row.item_type),
        )

    # Same-skill edges ordered by difficulty
    for _, group in item_table.sort_values("item_rating").groupby("skill_id"):
        ids = list(group["item_id"])
        ratings = dict(zip(group["item_id"], group["item_rating"]))

        for idx, u in enumerate(ids):
            for j in range(1, same_skill_k + 1):
                if idx + j < len(ids):
                    v = ids[idx + j]
                    dist = abs(ratings[u] - ratings[v]) / 1200.0
                    G.add_edge(
                        u,
                        v,
                        weight=float(min(1.0, dist)),
                        edge_type="same_skill"
                    )

    # Learner transition edges
    transition_counts = Counter()
    skill_transition_counts = Counter()

    for _, group in train.sort_values(["user_id", "timestamp"]).groupby("user_id", sort=False):
        items = group["item_id"].tolist()
        skills = group["skill_id"].tolist()

        for a, b in zip(items[:-1], items[1:]):
            if a != b:
                transition_counts[(a, b)] += 1

        for a, b in zip(skills[:-1], skills[1:]):
            if a != b:
                skill_transition_counts[(a, b)] += 1

    max_transition = max(transition_counts.values()) if transition_counts else 1

    for (u, v), count in transition_counts.items():
        if count >= transition_min_count and u in G and v in G:
            weight = 1.0 - (count / max_transition)

            if G.has_edge(u, v):
                G[u][v]["weight"] = min(G[u][v]["weight"], float(weight))
                G[u][v]["edge_type"] += "+flow"
            else:
                G.add_edge(u, v, weight=float(weight), edge_type="flow")

    # Bridge edges between representative items of frequently transitioning skills
    skill_rep = (
        item_table.sort_values(["skill_id", "n"], ascending=[True, False])
        .groupby("skill_id")["item_id"]
        .first()
        .to_dict()
    )

    max_skill_transition = max(skill_transition_counts.values()) if skill_transition_counts else 1

    for (s1, s2), count in skill_transition_counts.items():
        if count >= transition_min_count and s1 in skill_rep and s2 in skill_rep:
            u = skill_rep[s1]
            v = skill_rep[s2]

            if u != v and u in G and v in G:
                weight = 1.0 - (count / max_skill_transition)

                if not G.has_edge(u, v):
                    G.add_edge(u, v, weight=float(weight), edge_type="bridge")

    if G.number_of_nodes() == 0:
        item_table["centrality"] = 0.0
        item_table["in_degree_norm"] = 0.0
        item_table["out_degree_norm"] = 0.0
        return G, item_table

    in_deg = dict(G.in_degree())
    out_deg = dict(G.out_degree())

    max_in = max(in_deg.values()) if in_deg else 1
    max_out = max(out_deg.values()) if out_deg else 1

    print("Computing graph centrality...")

    if G.number_of_nodes() <= max_nodes_for_betweenness:
        betweenness = nx.betweenness_centrality(
            G,
            k=None,
            weight="weight",
            normalized=True
        )
    else:
        k = min(betweenness_sample, G.number_of_nodes())
        betweenness = nx.betweenness_centrality(
            G,
            k=k,
            weight="weight",
            normalized=True,
            seed=seed
        )

    item_table["centrality"] = item_table["item_id"].map(betweenness).fillna(0.0)

    cmax = item_table["centrality"].max()

    if cmax > 0:
        item_table["centrality"] = item_table["centrality"] / cmax

    item_table["in_degree_norm"] = item_table["item_id"].map(
        lambda x: in_deg.get(x, 0) / max(1, max_in)
    )

    item_table["out_degree_norm"] = item_table["item_id"].map(
        lambda x: out_deg.get(x, 0) / max(1, max_out)
    )

    return G, item_table


# ---------------------------------------------------------------------
# MARS model
# ---------------------------------------------------------------------

@dataclass
class LearnerState:
    rating: float = 1500.0
    velocity: float = 0.0
    n: int = 0
    streak: int = 0
    rolling_updates: deque = field(default_factory=lambda: deque(maxlen=20))
    topic_correct: dict = field(default_factory=lambda: defaultdict(int))
    topic_total: dict = field(default_factory=lambda: defaultdict(int))

    @property
    def sigma2(self):
        if len(self.rolling_updates) < 2:
            return 100.0
        return float(np.var(np.array(self.rolling_updates, dtype=float)))

    def update_bookkeeping(self, skill_id, correct, rating_delta):
        self.n += 1

        if correct:
            self.streak = self.streak + 1 if self.streak >= 0 else 1
        else:
            self.streak = self.streak - 1 if self.streak <= 0 else -1

        self.topic_total[skill_id] += 1
        self.topic_correct[skill_id] += int(correct)
        self.rolling_updates.append(float(rating_delta))


class BaseOnlineModel:
    name = "Base"

    def __init__(self, item_table, cfg):
        self.cfg = cfg
        self.initial_rating = cfg["initial_rating"]
        self.item_info = item_table.set_index("item_id").to_dict(orient="index")
        self.states = {}

    def get_state(self, user_id):
        if user_id not in self.states:
            self.states[user_id] = LearnerState(
                rating=self.initial_rating,
                rolling_updates=deque(maxlen=self.cfg["rolling_window"])
            )
        return self.states[user_id]

    def get_item(self, item_id):
        if item_id in self.item_info:
            return self.item_info[item_id]

        return {
            "item_rating": self.cfg["item_rating_center"],
            "skill_id": "unknown",
            "tref": self.cfg["default_ref_time_sec"],
            "centrality": 0.0,
            "in_degree_norm": 0.0,
            "out_degree_norm": 0.0,
        }

    @staticmethod
    def expected_prob(learner_rating, item_rating):
        return 1.0 / (1.0 + 10.0 ** ((item_rating - learner_rating) / 400.0))

    def predict_one(self, row):
        raise NotImplementedError

    def update_one(self, row):
        raise NotImplementedError


class MajorityModel(BaseOnlineModel):
    name = "Majority"

    def __init__(self, item_table, cfg, p):
        super().__init__(item_table, cfg)
        self.p = float(p)

    def predict_one(self, row):
        return self.p

    def update_one(self, row):
        return 0.0


class FixedEloModel(BaseOnlineModel):
    name = "FixedElo"

    def predict_one(self, row):
        st = self.get_state(str(row.user_id))
        item = self.get_item(str(row.item_id))
        return self.expected_prob(st.rating, float(item["item_rating"]))

    def update_one(self, row):
        st = self.get_state(str(row.user_id))
        item = self.get_item(str(row.item_id))

        p = self.expected_prob(st.rating, float(item["item_rating"]))
        delta = self.cfg["k_fixed"] * (int(row.correct) - p)

        st.rating += delta
        st.update_bookkeeping(str(item.get("skill_id", row.skill_id)), int(row.correct), delta)

        return float(delta)


class DARSModel(BaseOnlineModel):
    name = "DARS-NoMomentum"

    def __init__(
        self,
        item_table,
        cfg,
        dynamic_k=True,
        response_quality=True,
        graph_centrality=True,
        rapid_cap=True,
        streak_adjust=True
    ):
        super().__init__(item_table, cfg)
        self.dynamic_k = dynamic_k
        self.response_quality_enabled = response_quality
        self.graph_centrality = graph_centrality
        self.rapid_cap = rapid_cap
        self.streak_adjust_enabled = streak_adjust

    def effective_item_rating(self, item):
        rating = float(item.get("item_rating", self.cfg["item_rating_center"]))

        if self.graph_centrality:
            rating += self.cfg["centrality_xi"] * float(item.get("centrality", 0.0))

        return rating

    def k_factor(self, st):
        if not self.dynamic_k:
            return float(self.cfg["k_fixed"])

        if st.n < self.cfg["n_prov"]:
            return float(self.cfg["k_max"])

        sigma2 = st.sigma2

        return float(
            self.cfg["k_min"]
            + (self.cfg["k_max"] - self.cfg["k_min"])
            * math.exp(-self.cfg["lambda_n"] * (st.n - self.cfg["n_prov"]))
            * (sigma2 / (sigma2 + self.cfg["sigma2_0"]))
        )

    def streak_quality(self, streak):
        kmax = self.cfg["streak_k_max"]
        denom = max(abs(streak), kmax)
        return 0.5 * (1.0 + streak / denom)

    def streak_phi(self, streak):
        if not self.streak_adjust_enabled:
            return 1.0

        kmax = self.cfg["streak_k_max"]

        if streak >= self.cfg["pos_thr"]:
            return 1.0 + self.cfg["phi_max"] * (
                (streak - self.cfg["pos_thr"]) / max(1, kmax - self.cfg["pos_thr"])
            )

        if streak <= -self.cfg["neg_thr"]:
            return 1.0 - self.cfg["phi_shield"] * (
                (abs(streak) - self.cfg["neg_thr"]) / max(1, kmax - self.cfg["neg_thr"])
            )

        return 1.0

    def response_quality(self, row, item, st):
        correct = int(row.correct)

        if not self.response_quality_enabled:
            return float(correct)

        tref = float(item.get("tref", self.cfg["default_ref_time_sec"]))
        tspent = getattr(row, "response_time_sec", np.nan)

        if pd.isna(tspent) or float(tspent) <= 0:
            tspent = tref

        slack = self.cfg["time_slack_ratio"] * tref

        tau = np.clip(
            (tref - float(tspent) + slack) / max(1e-6, tref),
            0.0,
            1.0
        )

        hint_count = getattr(row, "hint_count", 0.0)

        H = np.clip(
            float(hint_count) / max(1.0, float(self.cfg["max_hint_count"])),
            0.0,
            1.0
        )

        psi = self.streak_quality(st.streak)

        quality = (
            self.cfg["w_time"] * tau
            + self.cfg["w_hint"] * (1.0 - H)
            + self.cfg["w_streak"] * psi
        )

        quality = float(np.clip(quality, 0.0, 1.0))

        if correct == 1:
        # Keep correct responses close to standard Elo.
        # Behavioural quality only makes a small adjustment.
            P = 0.90 + 0.10 * quality
        else:
    # Incorrect responses remain close to zero.
    # Small floor prevents total signal collapse.
            fail_floor = min(
            0.05,
            0.03 * quality
            )
            P = fail_floor

        return float(P)
    
    def response_quality_factor(self, row, item, st):
        tref = float(item.get("tref", self.cfg["default_ref_time_sec"]))
        tspent = getattr(row, "response_time_sec", np.nan)

        if pd.isna(tspent) or float(tspent) <= 0:
            tspent = tref

        slack = self.cfg["time_slack_ratio"] * tref

        tau = np.clip(
            (tref - float(tspent) + slack) / max(1e-6, tref),
            0.0,
            1.0
        )

        hint_count = getattr(row, "hint_count", 0.0)

        H = np.clip(
            float(hint_count) / max(1.0, float(self.cfg["max_hint_count"])),
            0.0,
            1.0
        )

        psi = self.streak_quality(st.streak)

        quality = (
            self.cfg["w_time"] * tau
            + self.cfg["w_hint"] * (1.0 - H)
            + self.cfg["w_streak"] * psi
        )

        quality = float(np.clip(quality, 0.0, 1.0))

        # Keep modifier conservative.
        # quality = 0 gives 0.85x update, quality = 1 gives 1.15x update.
        q_factor = 0.85 + 0.30 * quality

        return float(q_factor)

    def is_rapid_guess(self, row, item):
        if not self.cfg["rapid_guess_enabled"]:
            return False

        tspent = getattr(row, "response_time_sec", np.nan)

        if pd.isna(tspent) or float(tspent) <= 0:
            return False

        tref = float(item.get("tref", self.cfg["default_ref_time_sec"]))

        return float(tspent) < self.cfg["rapid_threshold_ratio"] * tref

    def raw_delta(self, row, st, item):
        effective_rating = self.effective_item_rating(item)
        E = self.expected_prob(st.rating, effective_rating)

        S = int(row.correct)
        K = self.k_factor(st)
        phi = self.streak_phi(st.streak)

        if self.response_quality_enabled:
            quality_factor = self.response_quality_factor(row, item, st)
        else:
            quality_factor = 1.0

        delta = K * phi * quality_factor * (S - E)

        if self.rapid_cap and S == 1 and self.is_rapid_guess(row, item):
            cap = self.cfg["rapid_cap_ratio"] * self.cfg["k_min"]
            delta = min(delta, cap)

        return float(delta), float(E)

    def predict_one(self, row):
        st = self.get_state(str(row.user_id))
        item = self.get_item(str(row.item_id))
        return self.expected_prob(st.rating, self.effective_item_rating(item))

    def update_one(self, row):
        st = self.get_state(str(row.user_id))
        item = self.get_item(str(row.item_id))

        delta, _ = self.raw_delta(row, st, item)

        st.rating += delta
        st.update_bookkeeping(str(item.get("skill_id", row.skill_id)), int(row.correct), delta)

        return float(delta)


class MARSModel(DARSModel):
    name = "MARS-Full"

    def beta(self, st):
        if st.n < self.cfg["n_prov"]:
            return float(self.cfg["beta_min"])

        sigma2 = st.sigma2
        nu = sigma2 / (sigma2 + self.cfg["sigma2_0"])

        beta = self.cfg["beta_min"] + (
            self.cfg["beta_max"] - self.cfg["beta_min"]
        ) * (1.0 - nu)

        return float(beta)

    def update_one(self, row):
        st = self.get_state(str(row.user_id))
        item = self.get_item(str(row.item_id))

        delta_raw, _ = self.raw_delta(row, st, item)

        if not self.cfg["momentum_enabled"]:
            update = delta_raw
            st.rating += update
            st.update_bookkeeping(str(item.get("skill_id", row.skill_id)), int(row.correct), update)
            return float(update)

        beta = self.beta(st)

        # Heavy-ball style ML momentum
        st.velocity = beta * st.velocity + delta_raw

        update = float(np.clip(st.velocity, -self.cfg["v_max"], self.cfg["v_max"]))

        st.rating += update
        st.update_bookkeeping(str(item.get("skill_id", row.skill_id)), int(row.correct), update)

        return float(update)


# ---------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------

def safe_auc(y_true, y_prob):
    if len(np.unique(y_true)) < 2:
        return np.nan
    return roc_auc_score(y_true, y_prob)


def compute_metrics(y_true, y_prob, threshold=0.5):
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob).astype(float)
    y_prob = np.clip(y_prob, 1e-6, 1.0 - 1e-6)

    y_pred = (y_prob >= threshold).astype(int)

    return {
        "AUC": safe_auc(y_true, y_prob),
        "Accuracy": accuracy_score(y_true, y_pred),
        "LogLoss": log_loss(y_true, y_prob, labels=[0, 1]),
        "Brier": brier_score_loss(y_true, y_prob),
    }


def online_warmup(model, train):
    for row in tqdm(
        train.itertuples(index=False),
        total=len(train),
        desc=f"Warmup {model.name}",
        leave=False
    ):
        model.update_one(row)


def online_evaluate(model, test, threshold=0.5, save_predictions=True):
    y_true = []
    y_prob = []
    deltas = []
    rows = []

    for row in tqdm(
        test.itertuples(index=False),
        total=len(test),
        desc=f"Evaluate {model.name}",
        leave=False
    ):
        p = model.predict_one(row)
        delta = model.update_one(row)

        y_true.append(int(row.correct))
        y_prob.append(float(p))
        deltas.append(float(delta))

        if save_predictions:
            rows.append({
                "model": model.name,
                "user_id": row.user_id,
                "item_id": row.item_id,
                "skill_id": row.skill_id,
                "correct": int(row.correct),
                "p_correct": float(p),
                "rating_delta": float(delta),
            })

    metrics = compute_metrics(y_true, y_prob, threshold=threshold)

    metrics.update({
        "MeanAbsUpdate": float(np.mean(np.abs(deltas))) if deltas else np.nan,
        "UpdateStd": float(np.std(deltas)) if deltas else np.nan,
        "N": int(len(y_true)),
    })

    pred_df = pd.DataFrame(rows) if save_predictions else pd.DataFrame()

    return metrics, pred_df


def evaluate_models(models, train, test, threshold=0.5, save_predictions=True):
    metric_rows = []
    pred_parts = []

    for model in models:
        online_warmup(model, train)
        metrics, preds = online_evaluate(
            model,
            test,
            threshold=threshold,
            save_predictions=save_predictions
        )

        metrics["Model"] = model.name
        metric_rows.append(metrics)

        if save_predictions:
            pred_parts.append(preds)

    metrics_df = pd.DataFrame(metric_rows)

    columns = [
        "Model", "AUC", "Accuracy", "LogLoss",
        "Brier", "MeanAbsUpdate", "UpdateStd", "N"
    ]

    metrics_df = metrics_df[[c for c in columns if c in metrics_df.columns]]

    if pred_parts:
        pred_df = pd.concat(pred_parts, ignore_index=True)
    else:
        pred_df = pd.DataFrame()

    return metrics_df, pred_df


# ---------------------------------------------------------------------
# Experiment preparation
# ---------------------------------------------------------------------

def default_config():
    return {
        "seed": 42,

        "initial_rating": 1500.0,
        "item_rating_center": 1500.0,
        "item_rating_scale": 400.0,

        "k_fixed": 32.0,
        "k_max": 45.0,
        "k_min": 12.0,
        "n_prov": 30,
        "lambda_n": 0.015,
        "sigma2_0": 100.0,
        "rolling_window": 20,

        "w_time": 0.50,
        "w_hint": 0.30,
        "w_streak": 0.20,
        "fail_floor_scale": 0.05,
        "fail_floor_max": 0.10,
        "time_slack_ratio": 0.15,
        "default_ref_time_sec": 60.0,

        "pos_thr": 3,
        "neg_thr": 3,
        "streak_k_max": 7,
        "phi_max": 0.35,
        "phi_shield": 0.35,

        "momentum_enabled": True,
        "beta_min": 0.02,
        "beta_max": 0.20,
        "v_max": 30.0,

        "rapid_guess_enabled": True,
        "rapid_threshold_ratio": 0.25,
        "rapid_cap_ratio": 0.10,

        "centrality_xi": 0.0,
        "max_hint_count": 5.0,

        "threshold": 0.5,
    }


def prepare(data_path, max_rows=None, min_user_interactions=5, test_ratio=0.2):
    df = load_public_dataset(data_path, max_rows=max_rows)

    df = filter_min_interactions(
        df,
        min_user_interactions=min_user_interactions
    )

    train, test = chronological_split_by_user(
        df,
        test_ratio=test_ratio
    )

    print(f"After filtering: total={len(df)}, train={len(train)}, test={len(test)}")
    print(f"Users={df.user_id.nunique()}, Items={df.item_id.nunique()}, Skills={df.skill_id.nunique()}")

    item = estimate_item_table(train)

    _, item = build_question_graph(
        train,
        item,
        same_skill_k=3,
        transition_min_count=3,
        max_nodes_for_betweenness=5000,
        betweenness_sample=1000,
        seed=42
    )

    max_hint = train["hint_count"].quantile(0.99)

    if pd.isna(max_hint):
        max_hint = 5.0

    max_hint = float(max(1.0, max_hint))

    return df, train, test, item, max_hint


# ---------------------------------------------------------------------
# Online and ablation experiments
# ---------------------------------------------------------------------

def run_online(args):
    ensure_dir(args.out)
    cfg = default_config()
    cfg["max_hint_count"] = 5.0

    df, train, test, item, max_hint = prepare(
        args.data,
        max_rows=args.max_rows,
        min_user_interactions=args.min_user_interactions,
        test_ratio=args.test_ratio
    )
    df.to_csv(Path(args.out) / "normalized_interactions.csv", index=False)
    train.to_csv(Path(args.out) / "train_interactions.csv", index=False)
    test.to_csv(Path(args.out) / "test_interactions.csv", index=False)
    cfg["max_hint_count"] = max_hint

    item.to_csv(Path(args.out) / "item_table_with_graph.csv", index=False)

    models = [
        MajorityModel(item, cfg, p=train["correct"].mean()),
        FixedEloModel(item, cfg),
        DARSModel(
            item,
            cfg,
            dynamic_k=True,
            response_quality=True,
            graph_centrality=True,
            rapid_cap=True,
            streak_adjust=True
        ),
        MARSModel(
            item,
            cfg,
            dynamic_k=True,
            response_quality=True,
            graph_centrality=True,
            rapid_cap=True,
            streak_adjust=True
        ),
    ]

    metrics, preds = evaluate_models(
        models,
        train,
        test,
        threshold=cfg["threshold"],
        save_predictions=True
    )

    metrics.to_csv(Path(args.out) / "metrics.csv", index=False)
    preds.to_csv(Path(args.out) / "predictions.csv", index=False)

    export_latex_table(
        metrics,
        Path(args.out) / "table_results.tex",
        caption="Online correctness prediction and rating stability results.",
        label="tab:online_results"
    )

    print(metrics)


def run_ablation(args):
    ensure_dir(args.out)
    cfg = default_config()

    df, train, test, item, max_hint = prepare(
        args.data,
        max_rows=args.max_rows,
        min_user_interactions=args.min_user_interactions,
        test_ratio=args.test_ratio
    )

    cfg["max_hint_count"] = max_hint

    models = [
        MARSModel(item, cfg, dynamic_k=True, response_quality=True, graph_centrality=True, rapid_cap=True, streak_adjust=True),
        DARSModel(item, cfg, dynamic_k=True, response_quality=True, graph_centrality=True, rapid_cap=True, streak_adjust=True),
        MARSModel(item, cfg, dynamic_k=False, response_quality=True, graph_centrality=True, rapid_cap=True, streak_adjust=True),
        MARSModel(item, cfg, dynamic_k=True, response_quality=False, graph_centrality=True, rapid_cap=True, streak_adjust=True),
        MARSModel(item, cfg, dynamic_k=True, response_quality=True, graph_centrality=False, rapid_cap=True, streak_adjust=True),
        MARSModel(item, cfg, dynamic_k=True, response_quality=True, graph_centrality=True, rapid_cap=False, streak_adjust=True),
        MARSModel(item, cfg, dynamic_k=True, response_quality=True, graph_centrality=True, rapid_cap=True, streak_adjust=False),
    ]

    names = [
        "MARS-Full",
        "MARS w/o Momentum",
        "MARS w/ Fixed K",
        "MARS w/ Binary P",
        "MARS w/o Graph",
        "MARS w/o Rapid Cap",
        "MARS w/o Streak",
    ]

    for model, name in zip(models, names):
        model.name = name

    metrics, _ = evaluate_models(
        models,
        train,
        test,
        threshold=cfg["threshold"],
        save_predictions=False
    )

    metrics.to_csv(Path(args.out) / "ablation.csv", index=False)

    export_latex_table(
        metrics,
        Path(args.out) / "table_ablation.tex",
        caption="Ablation study of MARS components.",
        label="tab:ablation_results"
    )

    print(metrics)


# ---------------------------------------------------------------------
# Simulation experiment
# ---------------------------------------------------------------------

def choose_item(policy, rating, item_table, seen, rng):
    candidates = item_table[~item_table["item_id"].isin(seen)]

    if len(candidates) == 0:
        candidates = item_table

    if policy == "random":
        return candidates.sample(1, random_state=int(rng.integers(1_000_000_000))).iloc[0]

    if policy == "nearest":
        idx = (candidates["item_rating"] - rating).abs().idxmin()
        return candidates.loc[idx]

    if policy == "mars":
        difficulty_match = 1.0 - (
            (candidates["item_rating"] - rating).abs() / 1200.0
        ).clip(0, 1)

        score = 0.80 * difficulty_match + 0.20 * candidates["centrality"]
        return candidates.loc[score.idxmax()]

    raise ValueError(f"Unknown policy: {policy}")


def simulate_policy(policy, n_learners=1000, n_items=1000, n_skills=20, steps=80, seed=42):
    rng = np.random.default_rng(seed)

    learner_theta = rng.normal(0, 1, size=n_learners)
    item_beta = rng.normal(0, 1, size=n_items)
    item_skill = rng.integers(0, n_skills, size=n_items)
    centrality = rng.beta(2, 8, size=n_items)

    item_table = pd.DataFrame({
        "item_id": [f"q{i}" for i in range(n_items)],
        "skill_id": [f"s{s}" for s in item_skill],
        "item_rating": 1500 + 300 * item_beta,
        "centrality": centrality,
    })

    rows = []

    for learner in range(n_learners):
        rating = 1500.0
        ability = learner_theta[learner]
        seen = set()
        correct_hist = []

        for t in range(steps):
            item = choose_item(policy, rating, item_table, seen, rng)
            qidx = int(str(item.item_id).replace("q", ""))

            p = sigmoid(ability - item_beta[qidx])
            y = int(rng.random() < p)

            seen.add(item.item_id)
            correct_hist.append(y)

            expected = 1.0 / (1.0 + 10.0 ** ((item.item_rating - rating) / 400.0))

            if policy == "mars":
                k = 40 if t < 30 else 20
                delta = k * (y - expected)
                rating += np.clip(delta, -40, 40)

                if y:
                    ability += 0.015
                elif item.item_rating < rating:
                    ability += 0.008

            elif policy == "nearest":
                rating += 32 * (y - expected)
                ability += 0.010 if y else 0.002

            else:
                rating += 32 * (y - expected)
                ability += 0.006 if y else 0.001

        rows.append({
            "Policy": policy,
            "FinalAccuracy": float(np.mean(correct_hist)),
            "FinalAbility": float(ability),
            "AbilityGain": float(ability - learner_theta[learner]),
            "FinalRating": float(rating),
        })

    return pd.DataFrame(rows)


def run_simulation(args):
    ensure_dir(args.out)

    parts = []

    for policy in ["random", "nearest", "mars"]:
        print(f"Running simulation policy: {policy}")

        part = simulate_policy(
            policy,
            n_learners=args.n_learners,
            n_items=args.n_items,
            n_skills=args.n_skills,
            steps=args.steps,
            seed=args.seed
        )

        parts.append(part)

    raw = pd.concat(parts, ignore_index=True)
    raw.to_csv(Path(args.out) / "simulation_raw.csv", index=False)

    summary = raw.groupby("Policy").agg(
        FinalAccuracy=("FinalAccuracy", "mean"),
        AbilityGain=("AbilityGain", "mean"),
        FinalRating=("FinalRating", "mean"),
        AbilityGainStd=("AbilityGain", "std"),
    ).reset_index()

    summary.to_csv(Path(args.out) / "simulation_metrics.csv", index=False)

    export_latex_table(
        summary,
        Path(args.out) / "table_simulation.tex",
        caption="Synthetic adaptive routing simulation.",
        label="tab:simulation_results"
    )

    print(summary)


# ---------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--mode",
        choices=["online", "ablation", "simulate"],
        required=True
    )

    parser.add_argument(
        "--data",
        default=None,
        help="Path to public dataset CSV"
    )

    parser.add_argument(
        "--out",
        default="results/output"
    )

    parser.add_argument(
        "--max_rows",
        type=int,
        default=None
    )

    parser.add_argument(
        "--min_user_interactions",
        type=int,
        default=5
    )

    parser.add_argument(
        "--test_ratio",
        type=float,
        default=0.2
    )

    parser.add_argument(
        "--n_learners",
        type=int,
        default=1000
    )

    parser.add_argument(
        "--n_items",
        type=int,
        default=1000
    )

    parser.add_argument(
        "--n_skills",
        type=int,
        default=20
    )

    parser.add_argument(
        "--steps",
        type=int,
        default=80
    )

    parser.add_argument(
        "--seed",
        type=int,
        default=42
    )

    args = parser.parse_args()

    set_seed(args.seed)

    if args.mode in ["online", "ablation"] and args.data is None:
        raise ValueError("--data is required for online and ablation modes.")

    if args.mode == "online":
        run_online(args)

    elif args.mode == "ablation":
        run_ablation(args)

    elif args.mode == "simulate":
        run_simulation(args)


if __name__ == "__main__":
    main()