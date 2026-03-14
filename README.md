# DGG Monthly Report (GitHub Pages)

This folder is a standalone static dashboard that can be moved to its own GitHub repository and hosted on GitHub Pages.

## What this solves

- No Python/runtime required for viewers.
- Public URL via GitHub Pages.
- Monthly update is just replacing one JSON file (`data/latest.json`).
- Includes interactive detail views: predicted trend, averaged FB trend, and current-month raw FB daily trend.

## 1) Create a separate repository

Recommended repo name: `dgg-monthly-report`.

From this workspace root:

```bash
mkdir -p /tmp/dgg-monthly-report
cp -R report_web_pages_project/. /tmp/dgg-monthly-report/
cd /tmp/dgg-monthly-report
git init
git add .
git commit -m "Initial GitHub Pages report"
git branch -M main
git remote add origin https://github.com/<YOUR_ORG_OR_USER>/dgg-monthly-report.git
git push -u origin main
```

Then in GitHub repo settings:

- `Settings` → `Pages`
- Source: `GitHub Actions`

Your site URL will be:

- `https://vallerrr.github.io/dgg-monthly-report/`

Example for user `vallerrr`:

- `https://vallerrr.github.io/dgg-monthly-report/`

## 2) Monthly update (from pipeline repo)

From this repository root (`dgg_pipeline`), run:

```bash
python -m src.report_web.export_static_payload --output report_web_pages_project/data/latest.json
```

Or use the one-command helper (exports + copies to sibling repo):

```bash
bash update_monthly_report_pages.sh
```

Auto-commit and push to GitHub in one go:

```bash
bash update_monthly_report_pages.sh --push
```

Optional month override:

```bash
bash update_monthly_report_pages.sh --year 2026 --month 2 --push
```

Optional detail payload controls:

```bash
bash update_monthly_report_pages.sh --data-type both --max-detail-pairs 500 --push
```

- `--data-type`: `fb_key` (default), `tessellated`, or `both`
- `--max-detail-pairs`: how many GID+outcome detail series to include in `latest.json`

Then copy the new `data/latest.json` into the separate Pages repo and push:

```bash
cp report_web_pages_project/data/latest.json /tmp/dgg-monthly-report/data/latest.json
cd /tmp/dgg-monthly-report
git add data/latest.json
git commit -m "Update monthly data"
git push
```

If you sync the whole folder, exclude macOS metadata files:

```bash
rsync -av --exclude '.git' --exclude '.DS_Store' report_web_pages_project/ ../dgg-monthly-report/
```

GitHub Actions will redeploy automatically.

## Optional: choose a specific month

```bash
python -m src.report_web.export_static_payload --year 2026 --month 2 --output report_web_pages_project/data/latest.json
```

## Notes

- This static site currently hosts the monthly summary table (the fastest Pages-compatible version).
- It now also includes drill-down charts for available GID+outcome pairs in the exported detail payload.
