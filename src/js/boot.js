/* Gear Bench — start-up, after every other script has loaded. */
'use strict';
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) hot.snapshot(() => serialize());
if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : null);
