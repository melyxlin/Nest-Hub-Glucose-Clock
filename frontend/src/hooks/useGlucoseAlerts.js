import { useCallback, useEffect, useRef, useState } from 'react'
import protectedUrl from '../utils/api'

function getStoredTimestamp(key) {
    return Number(window.sessionStorage.getItem(key) || 0)
}

function useGlucoseAlerts(reading) {
    const audioRef = useRef(null)

    const lastLowAlertTimestamp = useRef(
        getStoredTimestamp('lastLowAlertTimestamp'),
    )

    const lastHighAlertTimestamp = useRef(
        getStoredTimestamp('lastHighAlertTimestamp'),
    )

    const pendingAlertTimestamp = useRef({
        low: 0,
        high: 0,
    })

    const [audioEnabled, setAudioEnabled] = useState(false)
    const [showButton, setShowButton] = useState(true)
    const [buttonMessage, setButtonMessage] = useState(
        'Tap to enable alerts',
    )

    const playAlertTone = useCallback(async (kind) => {
        try {
            if (!audioRef.current) {
                audioRef.current = new Audio()
            }

            const audio = audioRef.current

            audio.pause()
            audio.src = protectedUrl(`/audio/${kind}.wav`)
            audio.currentTime = 0

            await audio.play()

            return true
        } catch (error) {
            console.warn(
                'Glucose alert sound could not play',
                error,
            )

            return false
        }
    }, [])

    const triggerGlucoseAlert = useCallback(
        async (kind, timestamp) => {
            if (pendingAlertTimestamp.current[kind] === timestamp) {
                return
            }

            pendingAlertTimestamp.current[kind] = timestamp

            const played = await playAlertTone(kind)

            if (played) {
                if (kind === 'low') {
                    lastLowAlertTimestamp.current = timestamp

                    window.sessionStorage.setItem(
                        'lastLowAlertTimestamp',
                        String(timestamp),
                    )
                } else {
                    lastHighAlertTimestamp.current = timestamp

                    window.sessionStorage.setItem(
                        'lastHighAlertTimestamp',
                        String(timestamp),
                    )
                }
            }

            pendingAlertTimestamp.current[kind] = 0
        },
        [playAlertTone],
    )

    const enableAlertAudio = useCallback(async () => {
        const played = await playAlertTone('test')

        if (!played) {
            setButtonMessage('Sound blocked — tap again')
            return
        }

        setAudioEnabled(true)
        setButtonMessage('Sound on ✓')

        window.setTimeout(() => {
            setShowButton(false)
        }, 1800)
    }, [playAlertTone])

    useEffect(() => {
        if (!reading || !audioEnabled) {
            return
        }

        if (
            reading.low_alert_sound &&
            reading.range === 'low' &&
            reading.timestamp > lastLowAlertTimestamp.current
        ) {
            triggerGlucoseAlert('low', reading.timestamp)
        }

        if (
            reading.high_alert_sound &&
            reading.range === 'high' &&
            reading.timestamp > lastHighAlertTimestamp.current
        ) {
            triggerGlucoseAlert('high', reading.timestamp)
        }
    }, [
        reading,
        audioEnabled,
        triggerGlucoseAlert,
    ])

    const soundsConfigured =
        reading?.low_alert_sound ||
        reading?.high_alert_sound

    return {
        audioEnabled,
        buttonMessage,
        enableAlertAudio,
        soundsConfigured,
        showButton,
    }
}

export default useGlucoseAlerts