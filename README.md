# Nest Hub Glucose Clock

A small Nightscout-backed glucose display designed for Google Nest Hub. The
current glucose is centered with its change and trend arrow, while the time and
date remain in a smaller header. The background changes for low, in-range,
high, stale, and unavailable states.

The included Cloud Run deployment keeps Nightscout credentials on the server,
so the display can continue updating when the computer used to cast it is off.

## Features

- Current glucose, delta, and Nightscout trend arrow
- Configurable low, high, polling, and stale thresholds
- Duplicate-source filtering for Nightscout integrations that upload the same
  CGM reading more than once
- Glucose disappears when the reading becomes stale
- Optional low and high WAV alert sounds
- Display access key separate from the Nightscout token
- Source-based Google Cloud Run deployment
- Local Cast helper for loading the hosted URL on a Nest Hub

## Important safety notice

This project is an unofficial secondary display. It is not a medical device and
must not replace a CGM receiver, approved CGM application, Loop alert, or other
primary glucose alarm. Cloud access, Nightscout, Wi-Fi, Cast sessions, browser
audio, and the Nest Hub can all fail or become stale. Verify glucose in a
primary source before making treatment decisions.

## Requirements

- A working Nightscout site and read-only access token
- A Google Cloud project with billing enabled
- Google Cloud Shell or the Google Cloud CLI
- A Nest Hub and a computer on the same Wi-Fi for the initial cast
- Python 3.9 or later for the Cast helper

## Deploy to Google Cloud Run

Set generic shell variables for the deployment. Choose your own values:

```bash
export PROJECT_ID="your-google-cloud-project-id"
export REGION="us-east1"
export SERVICE_NAME="nest-display"
export SERVICE_ACCOUNT_NAME="nest-display-runner"
gcloud config set project "$PROJECT_ID"
```

Enable the required services:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

Create a dedicated service account:

```bash
gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
  --display-name="Nest Display Cloud Run"
```

Store a read-only Nightscout token without placing it in shell history:

```bash
read -s -p "Paste read-only Nightscout token: " NIGHTSCOUT_TOKEN_VALUE; echo
printf '%s' "$NIGHTSCOUT_TOKEN_VALUE" | \
  gcloud secrets create nightscout-token --data-file=-
unset NIGHTSCOUT_TOKEN_VALUE
```

Give the dedicated account access to only that secret:

```bash
gcloud secrets add-iam-policy-binding nightscout-token \
  --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Enter the Nightscout URL and generate a separate display key:

```bash
read -p "Nightscout URL (https://...): " NIGHTSCOUT_URL_VALUE
DISPLAY_KEY="$(openssl rand -hex 16)"
```

Deploy from the repository root:

```bash
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --service-account="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --set-secrets="NIGHTSCOUT_TOKEN=nightscout-token:latest" \
  --set-env-vars="NIGHTSCOUT_URL=${NIGHTSCOUT_URL_VALUE},AUTH_MODE=query,LOW_THRESHOLD=70,HIGH_THRESHOLD=180,STALE_AFTER_MINUTES=10,POLL_SECONDS=60,LOW_ALERT_SOUND=true,HIGH_ALERT_SOUND=true,DISPLAY_ACCESS_KEY=${DISPLAY_KEY}"
```

Print and securely save the complete private display URL:

```bash
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" --format='value(status.url)')"
DISPLAY_URL="${SERVICE_URL}/?key=${DISPLAY_KEY}"
echo "$DISPLAY_URL"
```

Do not publish the complete display URL or put it in the repository.

## Cast the hosted display

Install the Cast helper dependencies on a computer connected to the same Wi-Fi
as the Nest Hub:

```bash
python3 -m venv .venv-cast
source .venv-cast/bin/activate
python3 -m pip install -r requirements-cast.txt
```

Cast the private display URL:

```bash
python3 cast_cloud.py "$DISPLAY_URL" "Your Nest Hub name"
```

The computer can shut down after the hosted page appears. A Nest Hub Cast
session is not guaranteed to remain open permanently; a reboot, update, network
interruption, or receiver timeout may require recasting.

Browser audio requires tapping **Tap to enable alerts** after a new cast
session. Audio support can vary with Nest Hub firmware, volume, and receiver
policy, so keep primary CGM alerts enabled.

## Configuration

Cloud Run reads these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NIGHTSCOUT_URL` | Required | Nightscout HTTPS origin |
| `NIGHTSCOUT_TOKEN` | Required | Read-only token supplied from Secret Manager |
| `AUTH_MODE` | `query` | Nightscout token transport: `query` or `header` |
| `LOW_THRESHOLD` | `70` | Values below this are low |
| `HIGH_THRESHOLD` | `180` | Values above this are high |
| `STALE_AFTER_MINUTES` | `10` | Hide readings older than this |
| `POLL_SECONDS` | `60` | Browser refresh interval |
| `UNITS` | `mg/dL` | Display units label |
| `LOW_ALERT_SOUND` | `true` | Enable low sound |
| `HIGH_ALERT_SOUND` | `true` | Enable high sound |
| `DISPLAY_ACCESS_KEY` | Strongly recommended | Protect display, API, and audio routes |

Update thresholds without changing code:

```bash
gcloud run services update "$SERVICE_NAME" \
  --region "$REGION" \
  --update-env-vars="LOW_THRESHOLD=70,HIGH_THRESHOLD=180"
```

Redeploy code changes with:

```bash
gcloud run deploy "$SERVICE_NAME" --source . --region "$REGION"
```

## Development and tests

The web service uses the Python standard library. Run tests with:

```bash
python3 -m unittest -v
python3 -m py_compile server.py cast_cloud.py
```

See [SECURITY.md](SECURITY.md) before publishing or reporting an issue.

## License

MIT
