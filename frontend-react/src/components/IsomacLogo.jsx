// ISOMAC Logo — hexagon with blue/green split and white zigzag
export default function IsomacLogo({ size = 32, showText = true, textSize = 'sm', dark = false }) {
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 100 115" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Hexagon top half — blue gradient */}
        <defs>
          <linearGradient id="blueGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4FC3F7"/>
            <stop offset="100%" stopColor="#2196F3"/>
          </linearGradient>
          <linearGradient id="greenGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#43A047"/>
            <stop offset="100%" stopColor="#1B5E20"/>
          </linearGradient>
        </defs>
        {/* Top blue half of hexagon */}
        <path d="M50 2 L95 27 L95 57 L50 57 L5 57 L5 27 Z" fill="url(#blueGrad)"/>
        {/* Bottom green half of hexagon */}
        <path d="M5 57 L50 57 L95 57 L95 87 L50 112 L5 87 Z" fill="url(#greenGrad)"/>
        {/* White zigzag / chart line */}
        <polyline
          points="18,62 35,42 50,55 65,35 82,52"
          fill="none"
          stroke="white"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showText && (
        <span className={`font-extrabold tracking-wide ${dark ? 'text-[#1a2340]' : 'text-white'} text-${textSize}`}>
          ISOMAC
        </span>
      )}
    </div>
  )
}
