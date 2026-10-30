/* ============ আইকন সেট (v51): একই ধাঁচের লাইন আইকন, রং আসে টেক্সটের রং থেকে ============ */
const ICONS={
  search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  chat:'<path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-4.2A7.5 7.5 0 1 1 20 12z"/>',
  cloud:'<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5a3.8 3.8 0 0 1-.5 7.5z"/><path d="M12 18v-5m0 0l-2.2 2.2M12 13l2.2 2.2"/>',
  wallet:'<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><path d="M4 7.5V17a2 2 0 0 0 2 2h12.5a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18.5 8H6.5A2.5 2.5 0 0 1 4 7.5z"/><circle cx="16" cy="13.5" r="1"/>',
  chart:'<path d="M5 20V10M12 20V4M19 20v-7"/>',
  tools:'<rect x="3.5" y="8" width="17" height="11.5" rx="2.5"/><path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8M3.5 13h17"/>',
  settings:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  shield:'<path d="M12 3l7 3v5.5c0 4.4-3 7.7-7 9.5-4-1.8-7-5.1-7-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  bell:'<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  palette:'<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-1.2-1-1.5-1-2.6 0-1 .8-1.6 1.8-1.6H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.7 16.7 3.5 12 3.5z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="7.8" r="1"/>',
  layers:'<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.2L12 20.7l8.5-4.5"/>',
  repeat:'<path d="M17 4l3 3-3 3"/><path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7H20M7 20l-3-3 3-3"/><path d="M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5H4"/>',
  target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  file:'<path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V8h4M9 13h6M9 16.5h6"/>',
  users:'<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.2A5 5 0 0 1 21 19"/>',
  table:'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14.5h16M10 5v14"/>',
  check:'<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.4l2.5 2.5 4.9-5.2"/>',
  book:'<path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12.5H7.5A2.5 2.5 0 0 1 5 17z"/><path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H18M9 8.5h5"/>',
  note:'<path d="M6.5 3.5h8L19 8v11.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M14.5 3.5V8H19M8.5 12.5l1.6 1.6 3.2-3.4M8.5 17.5h7"/>',
  filter:'<path d="M4 6.5h16M7 12h10M10 17.5h4"/>',
  download:'<path d="M12 4v10m0 0l-3.6-3.6M12 14l3.6-3.6M5 19h14"/>',
  edit:'<path d="M5 19l.9-3.9L16.4 4.6a1.9 1.9 0 0 1 2.7 0l.3.3a1.9 1.9 0 0 1 0 2.7L8.9 18.1z"/><path d="M14.6 6.4l3 3"/>',
  spark:'<path d="M12 4l1.8 4.7L18.5 10l-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.3z"/>'
};
function ico(name){ return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||''}</svg>`; }

/* ফাঁকা অবস্থা: ছবি + এক লাইনের কারণ + (থাকলে) একটা স্পষ্ট বোতাম */
function emptyState(o){
  return `<div class="empty-state es-rich"><div class="es-art">${ico(o.icon)}</div><div class="es-title">${o.title}</div>${o.body?`<div class="es-body">${o.body}</div>`:''}${o.label?`<button type="button" class="es-btn" onclick="${o.onclick}">${o.label}</button>`:''}</div>`;
}
