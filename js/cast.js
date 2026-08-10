/* ============================================================
   The six guides.

   One shared rig (legs, boots, head, ground shadow) so they read
   as one world; differentiated by silhouette, hair, garment,
   posture and a personal object, per the design brief.

   Animation hooks are class names, driven entirely from CSS:
     .rig-body  breathing
     .rig-eyes  blink
     .rig-sway  cloak / hem drift
   Each character gets its own delays so the six never move in
   lockstep, which is what makes a group of idle figures read as
   alive rather than as a looping GIF.
   ============================================================ */

const SKIN = '#dcb28c';
const SHADE = '#c99a72';
const BOOT = '#3a2a20';

const eyes = (spread = 9, y = 53) => `
  <g class="rig-eyes">
    <ellipse cx="${80 - spread}" cy="${y}" rx="3.2" ry="4.1" fill="#2a2016"/>
    <ellipse cx="${80 + spread}" cy="${y}" rx="3.2" ry="4.1" fill="#2a2016"/>
  </g>`;

/** Shared anatomy. `torso` and `prop` carry each character's identity. */
function rig({ torso, hair, prop = '', face, blink = 0, breath = 0 }) {
  return `
  <svg viewBox="0 0 160 196" xmlns="http://www.w3.org/2000/svg" style="--ed:${blink}s;--bd:${breath}s">
    <ellipse cx="80" cy="186" rx="42" ry="7" fill="#000" opacity=".28"/>
    <path d="M62,132 L60,178 Q60,186 68,186 L74,186 Q78,186 78,180 L77,132 Z" fill="#40352b"/>
    <path d="M98,132 L100,178 Q100,186 92,186 L86,186 Q82,186 82,180 L83,132 Z" fill="#40352b"/>
    <path d="M58,176 Q58,186 66,186 L76,186 L76,176 Z" fill="${BOOT}"/>
    <path d="M102,176 Q102,186 94,186 L84,186 L84,176 Z" fill="${BOOT}"/>
    <g class="rig-body">
      ${torso}
      ${prop}
      <circle cx="80" cy="54" r="29" fill="${SKIN}"/>
      <path d="M52,58 Q50,68 58,72 Q54,60 56,50 Z" fill="${SHADE}" opacity=".5"/>
      ${hair}
      ${face}
    </g>
  </svg>`;
}

export const CAST = [
  {
    id: 'thor', name: 'Thor', style: 'Kamp', accent: '--thor',
    quote: 'Klar til at blive testet?',
    strength: 'Styrke: selvtillid og fremdrift.',
    recommends: 'Thor peger på Altinget. Prøv det hele, på tid, og se hvor du står.',
    svg: rig({
      blink: 0, breath: 0,
      // broadest silhouette, forward lean
      torso: `<path d="M36,98 Q40,82 60,78 L100,78 Q120,82 124,98 L128,150 Q128,160 118,160 L42,160 Q32,160 32,150 Z" fill="#5c4130"/>
        <path d="M50,86 L110,86 L114,150 L46,150 Z" fill="var(--thor)" opacity=".85"/>
        <path d="M40,98 Q30,110 34,124 L46,120 Q42,108 48,100 Z" fill="${SKIN}"/>
        <circle cx="80" cy="128" r="6" fill="#e7dcc2" stroke="var(--thor)" stroke-width="2"/>`,
      hair: `<path d="M52,36 Q80,20 108,36 Q108,26 96,20 Q80,14 64,20 Q52,26 52,36 Z" fill="#7a4a2a"/>`,
      face: eyes(10, 52) + `
        <path d="M64,40 Q71,36 78,40" stroke="#3a2a20" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M82,40 Q89,36 96,40" stroke="#3a2a20" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M70,68 Q80,73 92,66" stroke="#8a4a30" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    }),
  },
  {
    id: 'freja', name: 'Freja', style: 'Fortælling', accent: '--freja',
    quote: 'Lad os se, hvor historien fører os hen.',
    strength: 'Styrke: nysgerrighed.',
    recommends: 'Freja peger på Øvelse. Følg spørgsmålene, og lad sammenhængene dukke op.',
    svg: rig({
      blink: 1.7, breath: .6,
      // tallest, slenderest, flowing cloak
      torso: `<g class="rig-sway"><path d="M56,86 Q40,110 44,150" stroke="#3f5650" stroke-width="10" fill="none" stroke-linecap="round" opacity=".9"/></g>
        <path d="M58,80 Q80,72 102,80 L118,158 Q118,164 112,164 L48,164 Q42,164 42,158 Z" fill="#3f5650"/>
        <path d="M60,84 Q80,78 100,84 L110,160 L50,160 Z" fill="var(--freja)" opacity=".55"/>
        <path d="M104,86 Q120,104 108,132 L96,126 Q106,108 96,92 Z" fill="${SKIN}"/>`,
      hair: `<path d="M52,30 Q80,12 108,30 Q110,44 104,58 L98,54 Q102,40 96,30 Q80,20 64,30 Q58,40 62,54 L56,58 Q50,44 52,30 Z" fill="#caa15a"/>
        <path d="M56,56 Q52,80 58,96" stroke="#caa15a" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M104,56 Q108,80 102,96" stroke="#caa15a" stroke-width="6" fill="none" stroke-linecap="round"/>`,
      prop: `<rect x="94" y="106" width="16" height="20" rx="3" fill="#7a5a3a" transform="rotate(18 102 116)"/>
        <circle cx="98" cy="128" r="2.6" fill="#d98f3a"/><circle cx="104" cy="131" r="2.6" fill="#d98f3a"/><circle cx="110" cy="129" r="2.6" fill="#d98f3a"/>`,
      face: eyes(9, 50) + `
        <path d="M65,42 Q71,39 77,42" stroke="#3a2a20" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M83,42 Q89,39 95,42" stroke="#3a2a20" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M72,66 Q80,70 88,66" stroke="#8a4a30" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    }),
  },
  {
    id: 'gorm', name: 'Gorm', style: 'Ro', accent: '--gorm',
    quote: 'Ingen grund til at skynde sig. Vi når det.',
    strength: 'Styrke: disciplin.',
    recommends: 'Gorm peger på Øvelse. Lidt hver dag slår alt andet.',
    svg: rig({
      blink: 3.1, breath: 1.4,
      // solid, upright, planted on the staff
      torso: `<path d="M48,86 L112,86 L120,158 Q120,164 114,164 L46,164 Q40,164 40,158 Z" fill="#4a4038"/>
        <path d="M52,90 L108,90 L114,158 L46,158 Z" fill="var(--gorm)" opacity=".5"/>
        <rect x="76" y="94" width="8" height="60" fill="#3a3128" opacity=".6"/>
        <rect x="48" y="112" width="64" height="6" fill="#2f2822" opacity=".4"/>`,
      hair: `<path d="M54,34 Q80,22 106,34 Q104,26 94,22 Q80,17 66,22 Q56,26 54,34 Z" fill="#9a978c"/>
        <path d="M54,50 Q80,60 106,50 L104,58 Q80,66 56,58 Z" fill="#9a978c"/>`,
      prop: `<line x1="30" y1="72" x2="26" y2="176" stroke="#5c4130" stroke-width="5" stroke-linecap="round"/>
        <rect x="23" y="56" width="14" height="16" rx="2" fill="#6b5138"/>
        <path d="M26,60 L34,68 M34,60 L26,68" stroke="#c9bd9f" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M20,66 Q10,90 16,120 L26,118 Q22,92 30,72 Z" fill="${SKIN}"/>`,
      face: eyes(9, 54) + `
        <path d="M66,46 L76,46" stroke="#5c5248" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M84,46 L94,46" stroke="#5c5248" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M72,68 Q80,71 88,68" stroke="#8a4a30" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    }),
  },
  {
    id: 'ingrid', name: 'Ingrid', style: 'Læring', accent: '--ingrid',
    quote: 'Lad os forstå det, der betyder noget.',
    strength: 'Styrke: forståelse.',
    recommends: 'Ingrid peger på Tinget. Værdispørgsmålene handler om principper, ikke udenadslære.',
    svg: rig({
      blink: 2.3, breath: 2.1,
      // balanced, layered, mid-explanation
      torso: `<path d="M52,84 Q80,76 108,84 L116,158 Q116,164 110,164 L50,164 Q44,164 44,158 Z" fill="#4a3f34"/>
        <path d="M56,88 Q80,82 104,88 L110,158 L50,158 Z" fill="var(--ingrid)" opacity=".55"/>
        <rect x="60" y="102" width="40" height="4" fill="#2f2822" opacity=".35"/>
        <path d="M108,90 Q124,104 118,128 L104,124 Q110,108 100,96 Z" fill="${SKIN}"/>`,
      hair: `<path d="M54,32 Q80,18 106,32 Q108,44 100,52 L52,48 Q50,40 54,32 Z" fill="#5a4636"/>
        <circle cx="80" cy="26" r="7" fill="#5a4636"/>`,
      prop: `<g transform="translate(96,118) rotate(-8)">
          <rect width="24" height="18" rx="1.5" fill="#e7dcc2"/>
          <rect width="24" height="18" rx="1.5" fill="none" stroke="#5a4636" stroke-width="1.6"/>
          <line x1="12" y1="1" x2="12" y2="17" stroke="#5a4636" stroke-width="1.2"/>
          <rect x="10" y="-3" width="4" height="7" fill="#c8102e"/>
        </g>`,
      face: eyes(9, 53) + `
        <path d="M65,44 Q71,41 77,44" stroke="#3a2a20" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M83,44 Q89,41 95,44" stroke="#3a2a20" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M73,67 Q80,70 87,67" stroke="#8a4a30" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    }),
  },
  {
    id: 'astrid', name: 'Astrid', style: 'Erindring', accent: '--astrid',
    quote: 'Giv mig en kendsgerning. Jeg giver dig en historie.',
    strength: 'Styrke: at gøre viden mindeværdig.',
    recommends: 'Astrid peger på Øvelse. Hun hænger hvert svar op på noget, du kan huske.',
    svg: rig({
      blink: 4.4, breath: 1.1,
      // asymmetric flowing hem, storyteller's raised hand
      torso: `<path d="M56,82 Q80,74 104,82 L120,150 Q122,160 110,162 L52,164 Q42,162 46,152 Z" fill="#463650"/>
        <path d="M58,86 Q80,80 102,86 L114,152 L50,158 Z" fill="var(--astrid)" opacity=".55"/>
        <g class="rig-sway"><path d="M100,92 Q118,86 114,150 L104,148 Q106,110 96,96 Z" fill="var(--astrid)" opacity=".3"/></g>
        <path d="M52,88 Q34,102 40,124 L52,120 Q48,106 58,96 Z" fill="${SKIN}"/>
        <path d="M62,84 Q66,76 72,84 Q66,90 62,84 Z" fill="#7a9a5a" opacity=".8"/>`,
      hair: `<path d="M50,32 Q80,14 110,32 Q110,42 104,48 L100,40 Q80,26 60,40 L56,48 Q50,42 50,32 Z" fill="#3a2a3a"/>
        <path d="M52,44 Q46,66 52,88" stroke="#3a2a3a" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M108,44 Q114,66 108,88" stroke="#3a2a3a" stroke-width="6" fill="none" stroke-linecap="round"/>`,
      prop: `<g transform="translate(24,96)">
          <path d="M0,0 Q-6,20 4,34 Q14,20 8,0 Z" fill="none" stroke="#caa15a" stroke-width="2.2"/>
          <line x1="0" y1="4" x2="8" y2="4" stroke="#caa15a" stroke-width="1.4"/>
          <line x1="-1" y1="12" x2="9" y2="12" stroke="#caa15a" stroke-width="1.4"/>
          <line x1="0" y1="20" x2="8" y2="20" stroke="#caa15a" stroke-width="1.4"/>
        </g>`,
      face: eyes(9, 50) + `
        <path d="M64,40 Q71,35 78,40" stroke="#3a2a20" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M82,40 Q89,35 96,40" stroke="#3a2a20" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M70,66 Q80,72 90,64" stroke="#8a4a30" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    }),
  },
  {
    id: 'bjorn', name: 'Bjørn', style: 'Udfordring', accent: '--bjorn',
    quote: 'Valgte du mig? Modigt valg.',
    strength: 'Styrke: venskabelig rivalisering.',
    recommends: 'Bjørn peger på Altinget. Han har allerede taget den. Slå hans resultat.',
    svg: rig({
      blink: 5.2, breath: 2.8,
      // compact, arms crossed, shield held casually
      torso: `<path d="M48,92 Q80,84 112,92 L118,158 Q118,164 112,164 L48,164 Q42,164 42,158 Z" fill="#4a3826"/>
        <path d="M52,96 Q80,90 108,96 L112,158 L48,158 Z" fill="var(--bjorn)" opacity=".55"/>
        <path d="M46,100 Q30,112 36,132 Q46,138 58,130 Q50,116 58,104 Z" fill="${SKIN}"/>
        <path d="M104,100 Q120,112 114,132 Q104,138 92,130 Q100,116 92,104 Z" fill="${SKIN}"/>`,
      hair: `<path d="M54,30 Q64,18 80,20 Q96,16 106,28 Q100,24 92,28 Q100,32 98,40 Q90,30 80,32 Q70,28 64,36 Q62,28 54,30 Z" fill="#6b4a2e"/>`,
      // ring-fortress shield, quartered like Trelleborg
      prop: `<circle cx="34" cy="118" r="15" fill="none" stroke="#7a5a3a" stroke-width="3"/>
        <circle cx="34" cy="118" r="15" fill="var(--bjorn)" opacity=".18"/>
        <circle cx="34" cy="118" r="10" fill="none" stroke="#7a5a3a" stroke-width="1.4" opacity=".6"/>
        <path d="M34,103 L34,133 M19,118 L49,118" stroke="#7a5a3a" stroke-width="1.4" opacity=".6"/>
        <circle cx="34" cy="118" r="4" fill="#7a5a3a"/>`,
      face: eyes(9, 55) + `
        <path d="M65,46 Q71,43 78,47" stroke="#3a2a20" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M82,47 Q89,43 95,46" stroke="#3a2a20" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M70,70 Q80,73 90,67" stroke="#8a4a30" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    }),
  },
];

export const byId = (id) => CAST.find((c) => c.id === id);
