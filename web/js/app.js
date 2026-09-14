const timeElement = document.getElementById('time');
    const dateElement = document.getElementById('date');
    const valueElement = document.getElementById('value');
    const unitsElement = document.getElementById('units');
    const deltaElement = document.getElementById('delta');
    const arrowElement = document.getElementById('arrow');
    const metadataElement = document.getElementById('metadata');
    const settingsButton = document.getElementById('settings-button');
    const settingsOverlay = document.getElementById('settings-overlay');
    const lowSetting = document.getElementById('low-setting');
    const highSetting = document.getElementById('high-setting');
    const lowSoundSetting = document.getElementById('low-sound-setting');
    const highSoundSetting = document.getElementById('high-sound-setting');
    const settingsMessage = document.getElementById('settings-message');
    const cancelSettingsButton = document.getElementById('cancel-settings');
    const saveSettingsButton = document.getElementById('save-settings');
    const enableSoundButton = document.getElementById('enable-sound');
    const alertAudio = document.getElementById('alert-audio');
    const historyChart = document.getElementById('history-chart');
    const historyEmpty = document.getElementById('history-empty');
    let latestReading = null;
    let latestHistory = [];
    let nextPollMilliseconds = 60000;
    let alertAudioEnabled = false;
    let currentSettings = {
      low_threshold: 70,
      high_threshold: 180,
      low_alert_sound: true,
      high_alert_sound: true
    };
    const pendingAlertTimestamp = { low: 0, high: 0 };
    const displayKey = new URLSearchParams(window.location.search).get('key');

    function protectedUrl(path) {
      if (!displayKey) return path;
      const separator = path.includes('?') ? '&' : '?';
      return `${path}${separator}key=${encodeURIComponent(displayKey)}`;
    }

    function settingsFromPayload(payload) {
      return {
        low_threshold: Number(payload.low_threshold),
        high_threshold: Number(payload.high_threshold),
        low_alert_sound: payload.low_alert_sound !== false,
        high_alert_sound: payload.high_alert_sound !== false
      };
    }

    function rangeForValue(value, settings) {
      if (value < settings.low_threshold) return 'low';
      if (value > settings.high_threshold) return 'high';
      return 'in-range';
    }

    function populateSettings(settings) {
      lowSetting.value = settings.low_threshold;
      lowSetting.textContent = settings.low_threshold;
      highSetting.value = settings.high_threshold;
      highSetting.textContent = settings.high_threshold;
      lowSoundSetting.checked = settings.low_alert_sound;
      highSoundSetting.checked = settings.high_alert_sound;
    }

    async function openSettings() {
      settingsMessage.textContent = 'Loading…';
      settingsOverlay.hidden = false;
      populateSettings(currentSettings);
      try {
        const response = await fetch(protectedUrl('/api/settings'), { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Settings unavailable');
        currentSettings = settingsFromPayload(payload);
        populateSettings(currentSettings);
        settingsMessage.textContent = '';
      } catch (error) {
        settingsMessage.textContent = 'Could not load saved settings.';
      }
    }

    function changeThreshold(kind, change) {
      const output = kind === 'low' ? lowSetting : highSetting;
      const minimum = kind === 'low' ? 40 : 60;
      const maximum = kind === 'low' ? 250 : 400;
      const next = Math.min(maximum, Math.max(minimum, Number(output.value) + change));
      output.value = next;
      output.textContent = next;
      settingsMessage.textContent = '';
    }

    async function saveSettings() {
      const candidate = {
        low_threshold: Number(lowSetting.value),
        high_threshold: Number(highSetting.value),
        low_alert_sound: lowSoundSetting.checked,
        high_alert_sound: highSoundSetting.checked
      };
      if (candidate.low_threshold >= candidate.high_threshold) {
        settingsMessage.textContent = 'Low must be below high.';
        return;
      }
      saveSettingsButton.disabled = true;
      settingsMessage.textContent = 'Saving…';
      try {
        const response = await fetch(protectedUrl('/api/settings'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(candidate)
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not save settings');
        currentSettings = settingsFromPayload(payload);
        if (latestReading) {
          Object.assign(latestReading, currentSettings);
          latestReading.range = rangeForValue(latestReading.value, currentSettings);
          renderReading(latestReading);
        }
        if (latestHistory.length > 0) {
          renderHistory(latestHistory);
        }
        settingsMessage.style.color = '#bfffe8';
        settingsMessage.textContent = 'Saved for this display and your other devices.';
        window.setTimeout(() => {
          settingsOverlay.hidden = true;
          settingsMessage.style.color = '';
        }, 900);
      } catch (error) {
        settingsMessage.textContent = error.message || 'Could not save settings.';
      } finally {
        saveSettingsButton.disabled = false;
      }
    }
    let lastLowAlertTimestamp = Number(
      window.sessionStorage.getItem('lastLowAlertTimestamp') || 0
    );
    let lastHighAlertTimestamp = Number(
      window.sessionStorage.getItem('lastHighAlertTimestamp') || 0
    );

    async function playAlertTone(kind) {
      try {
        alertAudio.pause();
        alertAudio.src = protectedUrl(`/audio/${kind}.wav`);
        alertAudio.currentTime = 0;
        await alertAudio.play();
        return true;
      } catch (error) {
        console.warn('Glucose alert sound could not play', error);
        return false;
      }
    }

    async function triggerGlucoseAlert(kind, timestamp) {
      if (pendingAlertTimestamp[kind] === timestamp) return;
      pendingAlertTimestamp[kind] = timestamp;
      const played = await playAlertTone(kind);
      if (played) {
        if (kind === 'low') {
          lastLowAlertTimestamp = timestamp;
          window.sessionStorage.setItem('lastLowAlertTimestamp', String(timestamp));
        } else {
          lastHighAlertTimestamp = timestamp;
          window.sessionStorage.setItem('lastHighAlertTimestamp', String(timestamp));
        }
      }
      pendingAlertTimestamp[kind] = 0;
    }

    async function enableAlertAudio() {
      try {
        const played = await playAlertTone('test');
        if (!played) throw new Error('Audio permission was blocked');

        alertAudioEnabled = true;
        enableSoundButton.textContent = 'Sound on ✓';
        window.setTimeout(() => { enableSoundButton.hidden = true; }, 1800);
      } catch (error) {
        enableSoundButton.textContent = 'Sound blocked — tap again';
        console.warn('Alert audio could not be enabled', error);
      }
    }

    function updateClock() {
      const now = new Date();
      timeElement.textContent = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: '2-digit'
      }).format(now);
      dateElement.textContent = new Intl.DateTimeFormat('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      }).format(now);
      if (latestReading) renderReading(latestReading);
    }

    function formatAge(seconds) {
      if (seconds < 45) return 'just now';
      const minutes = Math.max(1, Math.round(seconds / 60));
      return `${minutes} min ago`;
    }

    function setState(state) {
      document.body.className = state;
    }

    function renderReading(reading) {
      const liveAge = Math.max(0, Math.round(Date.now() / 1000 - reading.timestamp));
      const isStale = liveAge > reading.stale_after_minutes * 60;
      if (isStale) {
        setState('stale');
        valueElement.textContent = '';
        deltaElement.textContent = '';
        arrowElement.textContent = '';
        metadataElement.textContent = `Glucose unavailable · last update ${formatAge(liveAge)}`;
        return;
      }
      setState(reading.range);
      currentSettings = settingsFromPayload(reading);
      valueElement.textContent = reading.value;
      unitsElement.textContent = reading.units;
      deltaElement.textContent = reading.delta_display || '—';
      arrowElement.textContent = reading.arrow || '';
      metadataElement.textContent = `${reading.units} · ${formatAge(liveAge)}`;
      if (!reading.low_alert_sound && !reading.high_alert_sound) {
        enableSoundButton.hidden = true;
      }

      // Polling occurs every minute, but sound only once for each distinct
      // Nightscout low reading (normally one new reading every five minutes).
      if (
        alertAudioEnabled &&
        reading.low_alert_sound &&
        reading.range === 'low' &&
        reading.timestamp > lastLowAlertTimestamp
      ) {
        triggerGlucoseAlert('low', reading.timestamp);
      }

      if (
        alertAudioEnabled &&
        reading.high_alert_sound &&
        reading.range === 'high' &&
        reading.timestamp > lastHighAlertTimestamp
      ) {
        triggerGlucoseAlert('high', reading.timestamp);
      }
    }

    async function pollGlucose() {
      try {
        const response = await fetch(protectedUrl('/api/glucose'), { cache: 'no-store' });
        const reading = await response.json();
        if (!response.ok || !reading.ok) throw new Error(reading.error || 'Reading unavailable');
        latestReading = reading;
        nextPollMilliseconds = Math.max(30000, reading.poll_seconds * 1000);
        renderReading(reading);
      } catch (error) {
        latestReading = null;
        setState('error');
        valueElement.textContent = '';
        deltaElement.textContent = '';
        arrowElement.textContent = '';
        metadataElement.textContent = 'Glucose unavailable';
      } finally {
        window.setTimeout(pollGlucose, nextPollMilliseconds);
      }
    }

    function renderHistory(readings) {
      if (!Array.isArray(readings) || readings.length < 2) {
        historyChart.innerHTML = '';
        historyChart.hidden = true;
        historyEmpty.hidden = false;
        return;
      }

      const now = Date.now() / 1000;
      const sixHoursAgo = now - (6 * 60 * 60);

      const graphReadings = readings
        .filter(reading => {
          const value = Number(reading.value);
          const timestamp = Number(reading.timestamp);

          return (
            Number.isFinite(value) &&
            Number.isFinite(timestamp) &&
            timestamp >= sixHoursAgo &&
            timestamp <= now
          );
        })
        .sort((a, b) => a.timestamp - b.timestamp);

      if (graphReadings.length < 2) {
        historyChart.innerHTML = '';
        historyChart.hidden = true;
        historyEmpty.hidden = false;
        return;
      }

      historyChart.hidden = false;
      historyEmpty.hidden = true;

      const width = 800;
      const height = 180;

      const paddingLeft = 44;
      const paddingRight = 12;
      const paddingTop = 8;
      const paddingBottom = 32;

      const minimumValue = 40;
      const maximumValue = 300;

      const lowThreshold = Number(currentSettings.low_threshold);
      const highThreshold = Number(currentSettings.high_threshold);

      const plotWidth = width - paddingLeft - paddingRight;
      const plotHeight = height - paddingTop - paddingBottom;

      function xForTimestamp(timestamp) {
        return (
          paddingLeft +
          ((timestamp - sixHoursAgo) / (now - sixHoursAgo)) * plotWidth
        );
      }

      function yForValue(value) {
        const clamped = Math.max(
          minimumValue,
          Math.min(maximumValue, value)
        );

        return (
          paddingTop +
          ((maximumValue - clamped) /
            (maximumValue - minimumValue)) *
          plotHeight
        );
      }

      const points = graphReadings
        .map(reading => {
          return `${xForTimestamp(Number(reading.timestamp)).toFixed(1)},${yForValue(
            Number(reading.value)
          ).toFixed(1)}`;
        })
        .join(' ');

      const highY = yForValue(highThreshold);
      const lowY = yForValue(lowThreshold);

      const rangeTop = Math.min(highY, lowY);
      const rangeHeight = Math.abs(lowY - highY);

      const hourLabels = [
        { hoursAgo: 6, label: '6h ago' },
        { hoursAgo: 5, label: '5h' },
        { hoursAgo: 4, label: '4h' },
        { hoursAgo: 3, label: '3h' },
        { hoursAgo: 2, label: '2h' },
        { hoursAgo: 1, label: '1h' },
        { hoursAgo: 0, label: 'Now' }
      ];

      const timeLabels = hourLabels
        .map(({ hoursAgo, label }) => {
          const timestamp = now - (hoursAgo * 60 * 60);
          const x = xForTimestamp(timestamp);

          return `
        <line
          x1="${x}"
          y1="${height - paddingBottom}"
          x2="${x}"
          y2="${height - paddingBottom + 5}"
          stroke="rgba(255,255,255,.45)"
          stroke-width="1"
        />

        <text
          class="history-label"
          x="${x}"
          y="${height - 10}"
          text-anchor="${hoursAgo === 6
              ? 'start'
              : hoursAgo === 0
                ? 'end'
                : 'middle'
            }"
        >
          ${label}
        </text>
      `;
        })
        .join('');

      historyChart.innerHTML = `
    <rect
      class="history-range"
      x="${paddingLeft}"
      y="${rangeTop}"
      width="${plotWidth}"
      height="${rangeHeight}"
    />

    <line
      class="history-high-line"
      x1="${paddingLeft}"
      y1="${highY}"
      x2="${width - paddingRight}"
      y2="${highY}"
    />

    <line
      class="history-low-line"
      x1="${paddingLeft}"
      y1="${lowY}"
      x2="${width - paddingRight}"
      y2="${lowY}"
    />

    <line
      x1="${paddingLeft}"
      y1="${paddingTop}"
      x2="${paddingLeft}"
      y2="${height - paddingBottom}"
      stroke="rgba(255,255,255,.45)"
      stroke-width="1"
    />

    <line
      x1="${paddingLeft}"
      y1="${height - paddingBottom}"
      x2="${width - paddingRight}"
      y2="${height - paddingBottom}"
      stroke="rgba(255,255,255,.45)"
      stroke-width="1"
    />

    <text
      class="history-label"
      x="${paddingLeft - 8}"
      y="${yForValue(300) + 4}"
      text-anchor="end"
    >
      300
    </text>

    <text
      class="history-high-label history-label"
      x="${paddingLeft - 8}"
      y="${highY + 4}"
      text-anchor="end"
    >
      ${highThreshold}
    </text>

    <text
      class="history-low-label history-label"
      x="${paddingLeft - 8}"
      y="${lowY + 4}"
      text-anchor="end"
    >
      ${lowThreshold}
    </text>

    <text
      class="history-label"
      x="${paddingLeft - 8}"
      y="${yForValue(40) + 4}"
      text-anchor="end"
    >
      40
    </text>

    <polyline
      class="history-line"
      points="${points}"
    />

    ${timeLabels}
  `;
    }

    async function pollHistory() {
      try {
        const response = await fetch(
          protectedUrl('/api/history'),
          { cache: 'no-store' }
        );

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'History unavailable');
        }
        latestHistory = payload.readings;
        renderHistory(latestHistory);
      } catch (error) {
        console.warn('Could not load glucose history', error);
      } finally {
        window.setTimeout(pollHistory, 5 * 60 * 1000);
      }
    }

    updateClock();
    enableSoundButton.addEventListener('click', enableAlertAudio);
    settingsButton.addEventListener('click', openSettings);
    cancelSettingsButton.addEventListener('click', () => { settingsOverlay.hidden = true; });
    saveSettingsButton.addEventListener('click', saveSettings);
    document.querySelectorAll('[data-setting]').forEach((button) => {
      button.addEventListener('click', () => {
        changeThreshold(button.dataset.setting, Number(button.dataset.change));
      });
    });
    window.setInterval(updateClock, 1000);
    pollGlucose();
    pollHistory();
