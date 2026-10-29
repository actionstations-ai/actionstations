// A small horizontal bar chart for the health dashboard (#438, NFR-3). Hand-written SVG with a
// <title>/<desc>, the value printed as text on every bar (never colour alone), and a visually
// hidden table with the same numbers. Colours come from design tokens, so both themes follow.
const ROW = 26
const LABEL_W = 130
const BAR_W = 220

export interface BarItem {
  label: string
  value: number
}

export function Bars(props: { title: string; desc: string; items: BarItem[]; id: string }) {
  const max = Math.max(1, ...props.items.map((i) => i.value))
  const height = props.items.length * ROW + 4
  return (
    <figure className="health-chart">
      <svg
        role="img"
        viewBox={`0 0 ${LABEL_W + BAR_W + 50} ${height}`}
        aria-labelledby={`${props.id}-t ${props.id}-d`}
        className="health-bars"
      >
        <title id={`${props.id}-t`}>{props.title}</title>
        <desc id={`${props.id}-d`}>{props.desc}</desc>
        {props.items.map((item, i) => {
          const w = Math.round((item.value / max) * BAR_W)
          const y = i * ROW + 2
          return (
            <g key={item.label}>
              <text x={0} y={y + 16} className="health-bars__label">
                {item.label}
              </text>
              <rect
                x={LABEL_W}
                y={y + 3}
                width={Math.max(w, 1)}
                height={16}
                className="health-bars__bar"
              />
              <text x={LABEL_W + w + 6} y={y + 16} className="health-bars__value">
                {item.value}
              </text>
            </g>
          )
        })}
      </svg>
      <table className="sr-only">
        <caption>{props.title}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((i) => (
            <tr key={i.label}>
              <th scope="row">{i.label}</th>
              <td>{i.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
