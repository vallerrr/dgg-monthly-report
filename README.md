# DGG Monthly Report (GitHub Pages)

This folder is a standalone static dashboard that can be moved to its own GitHub repository and hosted on GitHub Pages.

## What this solves

- No Python/runtime required for viewers.
- Public URL via GitHub Pages.
- Monthly update is just replacing one JSON file (`data/latest.json`).

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

- `https://<YOUR_ORG_OR_USER>.github.io/dgg-monthly-report/`

## 2) Monthly update (from pipeline repo)

From this repository root (`dgg_pipeline`), run:

```bash
python -m src.report_web.export_static_payload --output report_web_pages_project/data/latest.json
```

Then copy the new `data/latest.json` into the separate Pages repo and push:

```bash
cp report_web_pages_project/data/latest.json /tmp/dgg-monthly-report/data/latest.json
cd /tmp/dgg-monthly-report
git add data/latest.json
git commit -m "Update monthly data"
git push
```

GitHub Actions will redeploy automatically.

## Optional: choose a specific month

```bash
python -m src.report_web.export_static_payload --year 2026 --month 2 --output report_web_pages_project/data/latest.json
```

## Notes

- This static site currently hosts the monthly summary table (the fastest Pages-compatible version).
- If you want full drill-down charts per GADM in Pages, we can extend the exporter to include those series too.
