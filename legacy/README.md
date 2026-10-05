# The old Python version

This is the first version of the app: a Flet desktop window and a command line tool.
It still works, but new work happens in the Electron app in the repo root.

## Run it

From this `legacy` folder:

```
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/flet run app.py
```

Command line version:

```
./.venv/bin/python main.py drill
./.venv/bin/python main.py chat
./.venv/bin/python main.py weak
./.venv/bin/python main.py stats
```

The chat needs `ANTHROPIC_API_KEY` set in your environment, or a key saved on the app's Settings screen.

## Your data

Everything is in `mandarin.db` in this folder. To carry it into the new app, open the new app,
go to Settings, click "Import my old database" and pick that file.
