import { useState } from 'react'

function SettingsDialog({
    settings,
    onClose,
    onSave,
}) {
    const [draft, setDraft] = useState(settings)

    function adjustThreshold(name, amount) {
        setDraft((current) => ({
            ...current,
            [name]: current[name] + amount,
        }))
    }

    async function handleSave() {
        await onSave(draft)
    }

    return (
        <div className="settings-overlay">
            <div
                className="settings-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-title"
            >
                <h2 id="settings-title">Settings</h2>

                <div className="setting-row">
                    <span>Low threshold</span>

                    <div className="threshold-control">
                        <button
                            type="button"
                            onClick={() => adjustThreshold('low_threshold', -5)}
                        >
                            −
                        </button>

                        <strong>{draft.low_threshold}</strong>

                        <button
                            type="button"
                            onClick={() => adjustThreshold('low_threshold', 5)}
                        >
                            +
                        </button>
                    </div>
                </div>

                <div className="setting-row">
                    <span>High threshold</span>

                    <div className="threshold-control">
                        <button
                            type="button"
                            onClick={() => adjustThreshold('high_threshold', -5)}
                        >
                            −
                        </button>

                        <strong>{draft.high_threshold}</strong>

                        <button
                            type="button"
                            onClick={() => adjustThreshold('high_threshold', 5)}
                        >
                            +
                        </button>
                    </div>
                </div>

                <label className="sound-setting">
                    <input
                        type="checkbox"
                        checked={draft.low_alert_sound}
                        onChange={(event) =>
                            setDraft((current) => ({
                                ...current,
                                low_alert_sound: event.target.checked,
                            }))
                        }
                    />
                    Low alert sound
                </label>

                <label className="sound-setting">
                    <input
                        type="checkbox"
                        checked={draft.high_alert_sound}
                        onChange={(event) =>
                            setDraft((current) => ({
                                ...current,
                                high_alert_sound: event.target.checked,
                            }))
                        }
                    />
                    High alert sound
                </label>

                <div className="settings-actions">
                    <button type="button" onClick={onClose}>
                        Cancel
                    </button>

                    <button type="button" onClick={handleSave}>
                        Save
                    </button>
                </div>
            </div>
        </div>
    )
}

export default SettingsDialog