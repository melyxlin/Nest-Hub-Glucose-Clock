function GlucoseChart({
    readings,
    lowThreshold,
    highThreshold,
    now,
}) {
    const width = 800
    const height = 180

    const padding = {
        top: 10,
        right: 10,
        bottom: 28,
        left: 42,
    }

    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const minGlucose = 40
    const maxGlucose = 300

    const endTimestamp = Math.floor(now.getTime() / 1000)
    const startTimestamp = endTimestamp - 6 * 60 * 60

    const recentReadings = readings
        .filter(
            (reading) =>
                reading.timestamp >= startTimestamp &&
                reading.timestamp <= endTimestamp,
        )
        .sort((a, b) => a.timestamp - b.timestamp)

    const deduplicatedReadings = recentReadings.filter(
        (reading, index, array) =>
            index === 0 ||
            reading.timestamp - array[index - 1].timestamp > 30,
    )

    function xForTimestamp(timestamp) {
        return (
            padding.left +
            ((timestamp - startTimestamp) /
                (endTimestamp - startTimestamp)) *
            chartWidth
        )
    }

    function yForGlucose(value) {
        const clamped = Math.max(
            minGlucose,
            Math.min(maxGlucose, value),
        )

        return (
            padding.top +
            ((maxGlucose - clamped) /
                (maxGlucose - minGlucose)) *
            chartHeight
        )
    }

    const points = deduplicatedReadings
        .map(
            (reading) =>
                `${xForTimestamp(reading.timestamp)},${yForGlucose(reading.value)}`,
        )
        .join(' ')

    const highY = yForGlucose(highThreshold)
    const lowY = yForGlucose(lowThreshold)
    const maxY = yForGlucose(maxGlucose)
    const minY = yForGlucose(minGlucose)

    const hourLabels = [6, 5, 4, 3, 2, 1, 0]

    if (deduplicatedReadings.length < 2) {
        return <div className="history-empty">Not enough glucose history</div>
    }

    return (
        <div className="history-chart-container">
            <svg
                className="history-chart"
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label="Glucose over the last six hours"
            >
                <text
                    x={padding.left - 8}
                    y={maxY + 4}
                    textAnchor="end"
                    className="axis-label"
                >
                    {maxGlucose}
                </text>

                <text
                    x={padding.left - 8}
                    y={minY}
                    textAnchor="end"
                    className="axis-label"
                >
                    {minGlucose}
                </text>
                <line
                    x1={padding.left}
                    y1={padding.top}
                    x2={padding.left}
                    y2={height - padding.bottom}
                    className="axis-line"
                />

                <line
                    x1={padding.left}
                    y1={height - padding.bottom}
                    x2={width - padding.right}
                    y2={height - padding.bottom}
                    className="axis-line"
                />
                <rect
                    x={padding.left}
                    y={highY}
                    width={chartWidth}
                    height={lowY - highY}
                    className="range-area"
                />

                <line
                    x1={padding.left}
                    y1={highY}
                    x2={width - padding.right}
                    y2={highY}
                    className="threshold-line high-line"
                />

                <line
                    x1={padding.left}
                    y1={lowY}
                    x2={width - padding.right}
                    y2={lowY}
                    className="threshold-line low-line"
                />

                <text
                    x={padding.left - 8}
                    y={highY + 4}
                    textAnchor="end"
                    className="threshold-label high-label"
                >
                    {highThreshold}
                </text>

                <text
                    x={padding.left - 8}
                    y={lowY + 4}
                    textAnchor="end"
                    className="threshold-label low-label"
                >
                    {lowThreshold}
                </text>

                <polyline
                    points={points}
                    className="glucose-line"
                />

                {hourLabels.map((hoursAgo) => {
                    const timestamp =
                        endTimestamp - hoursAgo * 60 * 60

                    const x = xForTimestamp(timestamp)

                    return (
                        <g key={hoursAgo}>
                            <line
                                x1={x}
                                y1={height - padding.bottom}
                                x2={x}
                                y2={height - padding.bottom + 5}
                                className="axis-tick"
                            />

                            <text
                                x={x}
                                y={height - 5}
                                textAnchor={
                                    hoursAgo === 6
                                        ? 'start'
                                        : hoursAgo === 0
                                            ? 'end'
                                            : 'middle'
                                }
                                className="time-label"
                            >
                                {hoursAgo === 0 ? 'Now' : `${hoursAgo}h`}
                            </text>
                        </g>
                    )
                })}
            </svg>
        </div>
    )
}

export default GlucoseChart