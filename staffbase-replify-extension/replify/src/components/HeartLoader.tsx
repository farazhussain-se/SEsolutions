import { colors } from "../styles/colors";

interface HeartLoaderProps {
  size?: number;
}

export default function HeartLoader({ size = 100 }: HeartLoaderProps) {
  const loaderColor = colors.primary;

  return (
    <div
      role="status"
      aria-label="loading"
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>
        {`
          @keyframes spinForward {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          
          @keyframes spinBackward {
            from { transform: rotate(0deg); }
            to { transform: rotate(-360deg); }
          }

          /* The plus sign still spins on its own local axis */
          .spin-center {
            animation: spinForward 2s linear infinite;
            transform-origin: 84.5px 354px; 
          }

          /* The rings now spin around the center of the expanded 850x850 canvas */
          .spin-ring-inner {
            animation: spinForward 8s linear infinite; /* Slowed down for large radius */
            transform-origin: 425px 425px;
          }

          .spin-ring-outer {
            animation: spinBackward 12s linear infinite; /* Slowed down for large radius */
            transform-origin: 425px 425px;
          }
        `}
      </style>

      {/* Expanded the viewBox to 850x850 to make room for the giant rings */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 850 850"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Inner Spinning Ring - Encompasses the heart */}
        <circle
          className="spin-ring-inner"
          cx="425"
          cy="425"
          r="340"
          stroke={loaderColor}
          strokeWidth="36"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="450 350"
        />

        {/* Outer Spinning Ring */}
        <circle
          className="spin-ring-outer"
          cx="425"
          cy="425"
          r="395"
          stroke={loaderColor}
          strokeWidth="36"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="600 450"
        />

        {/* We group the heart paths together and push them to the center of the new 850 canvas.
          (425 center) - (252 original heart center) = 173 X offset
          (425 center) - (235.5 original heart center) = 189.5 Y offset
        */}
        <g transform="translate(173, 189.5)">
          {/* Right side of heart */}
          <path d="M296.96 268.203C296.199 269.035 295.405 269.84 294.576 270.615L264.128 299.11L200.195 239.277L231.988 207.396L296.96 268.203ZM241.092 0C267.536 0 293.033 9.02862 313.5 25.376C333.967 9.02861 359.464 0 385.908 0H387.812C452.04 0 504 52.191 504 116.445C504 148.704 490.654 179.52 467.116 201.549V201.55L407.219 257.605C408.065 251.29 408.5 244.891 408.5 238.445C408.5 225.029 406.663 212.036 403.23 199.705L436.367 168.693C450.797 155.189 459 136.275 459 116.445C459 76.9274 427.071 45 387.812 45H385.908C367.042 45 348.95 52.5089 335.592 65.9033L329.432 72.0801L313.5 88.0557L297.568 72.0801L291.408 65.9033C278.05 52.5089 259.958 45 241.092 45H239.188C204.191 45 175.019 70.3713 169.098 103.874C155.087 98.5444 140.227 95.4031 125.03 94.668C135.201 40.802 182.399 0 239.188 0H241.092Z" fill={loaderColor}/>

          {/* Left side of heart */}
          <path d="M118.092 122C144.536 122 170.033 131.029 190.5 147.376C210.967 131.029 236.464 122 262.908 122H264.812C329.04 122 381 174.191 381 238.445C381 270.704 367.654 301.52 344.116 323.549V323.55L205.875 452.928L190.5 467.316L175.125 452.928L133.162 413.655L165.303 382.101L190.5 405.683L313.367 290.693C327.797 277.189 336 258.275 336 238.445C336 198.927 304.071 167 264.812 167H262.908C244.042 167 225.95 174.509 212.592 187.903L206.432 194.08L190.5 210.056L174.568 194.08L168.408 187.903C155.05 174.509 136.958 167 118.092 167H116.188C76.9291 167 45 198.927 45 238.445C45 254.426 50.329 269.812 59.9502 282.251L27.7012 313.91C9.90665 292.956 0 266.237 0 238.445C4.11415e-05 174.191 51.9599 122 116.188 122H118.092Z" fill={loaderColor}/>

          {/* The Animated Plus Sign */}
          <path
            className="spin-center"
            d="M72.2188 408.047V299.922H96.75V408.047H72.2188ZM30.4219 366.25V341.719H138.547V366.25H30.4219Z"
            fill={loaderColor}
          />
        </g>
      </svg>
    </div>
  );
}
