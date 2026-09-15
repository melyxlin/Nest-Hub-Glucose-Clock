import { useCallback, useEffect, useState } from 'react'
import './App.css'
import GlucoseChart from './components/GlucoseChart'
import SettingsDialog from './components/SettingsDialog'
import useGlucoseAlerts from './hooks/useGlucoseAlerts'
import protectedUrl from './utils/api'

function formatAge(ageSeconds) {
  if (ageSeconds < 60) {
    return 'just now'
  }

  const minutes = Math.floor(ageSeconds / 60)

  if (minutes === 1) {
    return '1 min ago'
  }

  return `${minutes} mins ago`
}

function App() {
  const [reading, setReading] = useState(null)
  const [history, setHistory] = useState([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(new Date())
  const {
    buttonMessage,
    enableAlertAudio,
    soundsConfigured,
    showButton,
  } = useGlucoseAlerts(reading)

  const fetchGlucose = useCallback(async () => {
    try {
      const response = await fetch(protectedUrl('/api/glucose'), {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      setReading(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch(protectedUrl('/api/history'), {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      setHistory(data.readings ?? [])
    } catch (err) {
      console.error('Unable to load glucose history:', err)
    }
  }, [])

  const saveSettings = useCallback(async (settings) => {
    const lowThreshold = settings.low_threshold
    const highThreshold = settings.high_threshold

    if (
      lowThreshold < 40 ||
      lowThreshold > 250 ||
      highThreshold < 60 ||
      highThreshold > 400 ||
      lowThreshold >= highThreshold
    ) {
      window.alert(
        'Low threshold must be 40–250, high threshold must be 60–400, and low must be below high.',
      )
      return
    }

    try {
      const response = await fetch(protectedUrl('/api/settings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      await fetchGlucose()
      await fetchHistory()

      setSettingsOpen(false)
    } catch (err) {
      window.alert(`Unable to save settings: ${err.message}`)
    }
  }, [fetchGlucose, fetchHistory])

  useEffect(() => {
    const initialTimer = window.setTimeout(fetchGlucose, 0)

    return () => window.clearTimeout(initialTimer)
  }, [fetchGlucose])

  useEffect(() => {
    if (!reading) {
      return undefined
    }

    const pollMilliseconds = Math.max(
      reading.poll_seconds ?? 60,
      30,
    ) * 1000

    const timer = window.setTimeout(fetchGlucose, pollMilliseconds)

    return () => window.clearTimeout(timer)
  }, [fetchGlucose, reading])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const initialTimer = window.setTimeout(fetchHistory, 0)

    return () => window.clearTimeout(initialTimer)
  }, [fetchHistory])

  useEffect(() => {
    const timer = window.setInterval(
      fetchHistory,
      5 * 60 * 1000,
    )

    return () => window.clearInterval(timer)
  }, [fetchHistory])

  const time = now.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

  const date = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  if (error && !reading) {
    return (
      <main className="display display-error">
        <div className="status-message">Unable to load glucose</div>
        <div className="metadata">{error}</div>
      </main>
    )
  }

  if (!reading) {
    return (
      <main className="display display-loading">
        <div className="status-message">Connecting to Nightscout…</div>
      </main>
    )
  }

  const liveAgeSeconds = Math.max(
    0,
    Math.floor(now.getTime() / 1000) - reading.timestamp,
  )

  const stale =
    liveAgeSeconds > reading.stale_after_minutes * 60

  const rangeClass = stale
    ? 'display-stale'
    : `display-${reading.range}`

  return (
    <main className={`display ${rangeClass}`}>
      <header className="clock">
        <div className="time">{time}</div>
        <div className="date">{date}</div>
      </header>

      <section className="glucose" aria-label="Current glucose">
        <div className="glucose-layout">
          <div className="reading">
            <span className="glucose-value">{reading.value}</span>
            <span className="units">{reading.units}</span>
          </div>

          <div className="trend">
            <span className="delta">
              {reading.delta === 0 ? '0' : reading.delta_display}
            </span>
            <span className="arrow">{reading.arrow}</span>
          </div>
        </div>
      </section>
      <section className="status-row">
        <div className="status-chart">
          <GlucoseChart
            readings={history}
            lowThreshold={reading.low_threshold}
            highThreshold={reading.high_threshold}
            now={now}
          />
        </div>

        <div className="status-stat">
          <span className="status-label">IOB</span>
          <span className="status-value">
            {reading.iob == null ? '—' : `${reading.iob.toFixed(1)} U`}
          </span>
        </div>

        <div className="status-stat">
          <span className="status-label">COB</span>
          <span className="status-value">
            {reading.cob == null ? '—' : `${Math.round(reading.cob)} g`}
          </span>
        </div>

        <div className="status-stat status-update">
          <span className="status-label">Updated</span>
          <span className="status-value">
            {stale ? 'Stale data' : formatAge(liveAgeSeconds)}
          </span>
        </div>
      </section>

      <button
        type="button"
        className="settings-button"
        onClick={() => setSettingsOpen(true)}
      >
        Settings
      </button>

      {settingsOpen && (
        <SettingsDialog
          settings={{
            low_threshold: reading.low_threshold,
            high_threshold: reading.high_threshold,
            low_alert_sound: reading.low_alert_sound,
            high_alert_sound: reading.high_alert_sound,
          }}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}
      {soundsConfigured && showButton && (
        <button
          type="button"
          className="sound-button"
          onClick={enableAlertAudio}
        >
          {buttonMessage}
        </button>
      )}
    </main>
  )
}

export default App