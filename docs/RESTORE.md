# Disaster Recovery: Restoring Autograder from a Google Drive Backup

This is the explicit, step-by-step procedure to rebuild a working Autograder deployment
on a fresh VM from a nightly encrypted backup (see `scripts/backup.sh` /
`deploy/systemd/autograder-backup.timer` for how backups are produced).

Backups contain student PII (names, emails, grades, submitted code) and are GPG-encrypted
before they ever leave the VM. You will need the GPG passphrase (kept outside the backup
payload — do not lose it, there is no recovery without it) and access to the Google
account holding the `gdrive` rclone remote.

## 1. Provision the fresh VM
- Install Docker Engine + the Compose plugin.
- Create an operations user (`autograder-ops`) and add it to the `docker` group:
  ```bash
  sudo usermod -aG docker autograder-ops
  ```

## 2. Clone the repo
```bash
git clone git@github.com:zvikrnt/Autograder.git /opt/autograder
cd /opt/autograder
git checkout <last known-good tag, e.g. v1.2.0>
```

## 3. Configure rclone
```bash
rclone config   # set up the "gdrive" remote — interactive, needs the Drive account
```
This step cannot be scripted headlessly without a pre-existing OAuth token; the operator
running the restore needs access to the Google account used for backups.

## 4. Download the latest backup
```bash
rclone lsf gdrive:autograder-backups/daily/ | sort | tail -1   # find the newest
mkdir -p /opt/autograder/restore
rclone copy gdrive:autograder-backups/daily/<latest>.tar.gz.gpg /opt/autograder/restore/
```

## 5. Decrypt and unpack
```bash
cd /opt/autograder/restore
gpg --batch --yes --passphrase-file /path/to/backup-gpg-passphrase \
    --output backup.tar.gz --decrypt <latest>.tar.gz.gpg
tar -xzf backup.tar.gz
```

## 6. Restore secrets first
```bash
cp <extracted>/backend.env /opt/autograder/backend/.env
sudo mkdir -p /etc/autograder/tls
sudo cp <extracted>/*.crt <extracted>/*.key /etc/autograder/tls/
```
If the college's TLS cert has been rotated since the backup was taken, request a fresh
one from IT instead of restoring the old one — safer default.

## 7. Bring up only the data tier
```bash
cd /opt/autograder
docker compose -f docker-compose.prod.yml --env-file backend/.env up -d db redis minio
# wait for healthchecks:
docker compose -f docker-compose.prod.yml ps
```

## 8. Restore Postgres
```bash
docker compose -f docker-compose.prod.yml exec -T db \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
    < /opt/autograder/restore/<extracted>/postgres.dump
```

## 9. Restore MinIO data
Point an rclone remote (`minio_local`, same pattern used by `backup.sh`) at the freshly
started MinIO, then:
```bash
rclone sync /opt/autograder/restore/<extracted>/minio_data minio_local:autograder-bucket
```

## 10. Bring up the rest of the stack
```bash
docker compose -f docker-compose.prod.yml --env-file backend/.env up -d --scale backend=3
```

## 11. Run migrations
In case the backup slightly predates the checked-out code:
```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
```

## 12. Smoke test
- Log in as a known test account.
- Confirm a class/assignment loads.
- Confirm a WebSocket connection (e.g. the live leaderboard) connects.
- Submit a piece of code to a real assignment and confirm it grades successfully —
  this single check exercises Postgres, Redis, MinIO, and Docker-socket-based grading
  all at once, and is the best overall signal the restore worked end-to-end.

## 13. DNS
Confirm (or coordinate with college IT to update) that `autograder.iitbh` points at the
new VM's IP. Expect a brief propagation window; plan the cutover accordingly.

## Rehearse this before you need it
An unrehearsed restore procedure is not a verified one. Run through steps 1–12 against a
scratch VM/environment at least once before trusting this as a real disaster-recovery
path, and re-verify after any significant change to the backup script or compose stack.
