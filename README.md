# Recon

Recon is a local web app for capturing people you meet at networking events. It stores people, dated event tags, notes, social links, optional audio recordings, generated transcripts, and Apollo-enriched email/LinkedIn data.

## Run

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 server.py
```

Then open `http://127.0.0.1:8000`.

The app can run without API keys for local note-taking. Apollo lookup requires `APOLLO_API_KEY`, audio transcription requires `OPENAI_API_KEY`, and LinkedIn message generation requires `ANTHROPIC_API_KEY`.

## Environment Variables

Copy `.env.example` to `.env` and fill in the keys you need:

- `PORT`: local server port.
- `HOST`: local server bind address.
- `RECON_DB_PATH`: SQLite database path.
- `RECON_MEDIA_DIR`: directory for uploaded audio files.
- `RECON_MAX_UPLOAD_MB`: maximum JSON/audio upload size.
- `APOLLO_API_KEY`: required for Apollo candidate search and enrichment.
- `APOLLO_BASE_URL`: Apollo API base URL.
- `APOLLO_SEARCH_PER_PAGE`: number of Apollo candidates to show.
- `APOLLO_REQUEST_TIMEOUT`: Apollo request timeout in seconds.
- `APOLLO_RUN_WATERFALL_EMAIL`: optional Apollo waterfall email enrichment flag.
- `OPENAI_API_KEY`: required for transcription.
- `OPENAI_TRANSCRIPTION_URL`: OpenAI-compatible transcription endpoint.
- `OPENAI_TRANSCRIPTION_MODEL`: transcription model.
- `OPENAI_TRANSCRIPTION_LANGUAGE`: optional language hint.
- `ANTHROPIC_API_KEY`: required for LinkedIn message generation.
- `ANTHROPIC_MESSAGES_URL`: Anthropic Messages API endpoint.
- `ANTHROPIC_MODEL`: Claude model for LinkedIn messages.
- `ANTHROPIC_VERSION`: Anthropic API version header.
- `ANTHROPIC_REQUEST_TIMEOUT`: Claude request timeout in seconds.

## Data

- People and dated/reorderable events are stored in SQLite at `data/recon.sqlite3` by default.
- Audio files are stored under `media/audio`.
- Runtime data and the provided reference files are ignored by git.
