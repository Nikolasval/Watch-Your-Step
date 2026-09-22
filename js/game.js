(function () {
  'use strict';

  /* ---------------------------------------------------------------- setup */

  var W = 1200, H = 420, GROUND_Y = 337;

  var cvs = document.getElementById('game');
  var ctx = cvs.getContext('2d');

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    cvs.width = Math.round(W * dpr);
    cvs.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    try { ctx.letterSpacing = '2px'; } catch (e) {}
  }
  resize();
  window.addEventListener('resize', resize);

  /* --------------------------------------------------------------- tuning */

  var GRAVITY      = 2900;   // px/s^2
  var JUMP_V       = 800;    // px/s  -> ~110px apex, ~0.55s airtime
  var JUMP_CUT     = 0.45;   // fraction of velocity kept on an early release
  var FAST_FALL    = 2.2;    // gravity multiplier while holding down mid-air
  var COYOTE       = 0.09;   // s of grace after leaving the ground
  var BUFFER       = 0.12;   // s an early jump press stays queued
  var START_SPEED  = 380;    // px/s
  var MAX_SPEED    = 880;
  var ACCEL        = 7;      // px/s per second
  var NIGHT_EVERY  = 700;    // score per day/night flip

  var PX = 2;                // sprite pixel size
  var SHOE_W = 52, SHOE_H = 40;
  var DUCK_W = 60, DUCK_H = 18;
  var FLY_W  = 36, FLY_H  = 24;

  /* --------------------------------------------------------------- sprites */

  // high-top sneaker, facing right: collar at the left, toe box at the right
  var SHOE_BODY = [
    '.#######..................',
    '#########.................',
    '#########.................',
    '#########.................',
    '#########.................',
    '##########................',
    '##########................',
    '###########...............',
    '#############.............',
    '###############...........',
    '##################........',
    '####################......',
    '######################....',
    '########################..',
    '#########################.',
    '##########################',
    '##########################',
    '##########################',
    '##########################'
  ];

  // last row is the outsole; swapping it gives a heel-toe walk cycle
  var SHOE_STAND = SHOE_BODY.concat(['.########################.']);
  var SHOE_RUN_A = SHOE_BODY.concat(['.........#################']);  // heel lifted
  var SHOE_RUN_B = SHOE_BODY.concat(['#################.........']);  // toe lifted

  // the same shoe squashed flat
  var DUCK_BODY = [
    '...######.....................',
    '.##########...................',
    '.#################............',
    '.#########################....',
    '.############################.',
    '##############################',
    '##############################',
    '##############################'
  ];
  var DUCK_A = DUCK_BODY.concat(['..##########################..']);
  var DUCK_B = DUCK_BODY.concat(['.##########################...']);

  // background-coloured cutouts, in sprite cells: [x, y, w, h]
  var SHOE_CUTS = [
    [2, 0, 5, 4],     // ankle opening
    [9, 10, 4, 1],    // laces
    [11, 12, 4, 1],
    [13, 14, 4, 1],
    [1, 16, 24, 1]    // sole seam
  ];
  var DUCK_CUTS = [
    [4, 0, 4, 2],     // ankle opening
    [2, 6, 26, 1]     // sole seam
  ];

  function drawMap(map, x, y, scale, color) {
    ctx.fillStyle = color;
    for (var r = 0; r < map.length; r++) {
      var row = map[r], c = 0;
      while (c < row.length) {
        if (row.charAt(c) === '#') {
          var s = c;
          while (c < row.length && row.charAt(c) === '#') c++;
          ctx.fillRect(Math.round(x + s * scale), Math.round(y + r * scale),
            Math.round((c - s) * scale), Math.round(scale));
        } else {
          c++;
        }
      }
    }
  }

  function drawCuts(cuts, x, y, scale, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < cuts.length; i++) {
      var c = cuts[i];
      ctx.fillRect(x + c[0] * scale, y + c[1] * scale, c[2] * scale, c[3] * scale);
    }
  }

  // one dome: flat bottom, rounded top
  function dome(cx, bottom, w, h) {
    var r = w / 2;
    ctx.beginPath();
    ctx.moveTo(cx - r, bottom);
    ctx.lineTo(cx - r, bottom - h + r);
    ctx.arc(cx, bottom - h + r, r, Math.PI, 0);
    ctx.lineTo(cx + r, bottom);
    ctx.closePath();
    ctx.fill();
  }

  // a squat three-tier pile, swirled like a soft-serve
  function drawPile(x, y, w, h, color, highlight) {
    ctx.fillStyle = color;
    var cx = x + w / 2;
    var bottom = y + h;
    dome(cx, bottom, w * 1.08, h * 0.56);
    dome(cx + w * 0.02, bottom - h * 0.38, w * 0.80, h * 0.40);
    dome(cx + w * 0.04, bottom - h * 0.64, w * 0.54, h * 0.32);
    // curled point on top, swept to one side
    ctx.beginPath();
    ctx.ellipse(cx + w * 0.14, bottom - h * 0.86, Math.max(2, w * 0.15), Math.max(2, h * 0.10), -0.5, 0, Math.PI * 2);
    ctx.fill();

    // lighter swirl highlights on each tier
    ctx.fillStyle = highlight || color;
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.22, bottom - h * 0.18, w * 0.10, h * 0.07, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.15, bottom - h * 0.48, w * 0.08, h * 0.06, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + w * 0.05, bottom - h * 0.72, w * 0.06, h * 0.05, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFly(x, y, frame, color) {
    // 36 x 24 box, facing left
    ctx.fillStyle = color;

    ctx.beginPath();          // wings
    if (frame === 0) {
      ctx.ellipse(x + 22, y + 5, 11, 4, -0.35, 0, Math.PI * 2);
    } else {
      ctx.ellipse(x + 22, y + 10, 11, 4, 0.3, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.beginPath();          // abdomen
    ctx.ellipse(x + 21, y + 14, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();          // head
    ctx.arc(x + 8, y + 13, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillRect(x + 14, y + 20, 2, 4);   // legs
    ctx.fillRect(x + 20, y + 20, 2, 4);
    ctx.fillRect(x + 26, y + 20, 2, 3);
  }

  function drawCloud(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 14 * s, y + 12 * s, 9 * s, 0, Math.PI * 2);
    ctx.arc(x + 26 * s, y + 8 * s, 12 * s, 0, Math.PI * 2);
    ctx.arc(x + 40 * s, y + 12 * s, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + 12 * s, y + 12 * s, 30 * s, 8 * s);
  }

  // a bone segment, snapped to whole pixels so it reads as blocky/pixel-art
  function drawBoneRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  // a half-buried corpse lying flat in the dirt: skull, ribcage, bent arms,
  // pelvis and two outstretched legs, built entirely from axis-aligned
  // rectangles so it stays crisp/pixelated like the rest of the sprites
  function drawSkeletonCorpse(x, y, flip, scale, color, eyeColor) {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);

    var u = 3 * scale;
    function r(cx, cy, cw, ch) { drawBoneRect(cx * u, cy * u, cw * u, ch * u, color); }

    // skull
    r(-2, -2, 4, 4);
    ctx.fillStyle = eyeColor;
    ctx.fillRect(Math.round(-1.4 * u), Math.round(-1 * u), Math.round(0.7 * u), Math.round(0.9 * u));
    ctx.fillRect(Math.round(0.4 * u), Math.round(-1 * u), Math.round(0.7 * u), Math.round(0.9 * u));

    // neck + spine
    r(2, -0.5, 6, 1);

    // ribs
    r(3, -2, 1, 1.5);
    r(3, 0.5, 1, 1.5);
    r(5, -2, 1, 1.5);
    r(5, 0.5, 1, 1.5);
    r(7, -2, 1, 1.5);
    r(7, 0.5, 1, 1.5);

    // arms, bent up and down alongside the ribcage
    r(2.5, -3.5, 1, 1.5);
    r(3.5, -4.5, 2, 1);
    r(2.5, 2, 1, 1.5);
    r(3.5, 3.5, 2, 1);

    // pelvis
    r(8, -1.5, 3, 3);

    // legs, outstretched
    r(11, -1.5, 7, 1.2);
    r(11, 0.8, 7, 1.2);

    // feet
    r(17.5, -2, 1, 1.8);
    r(17.5, 0.3, 1, 1.8);

    ctx.restore();
  }

  function drawGraveyardGround(y, dirtColor) {
    ctx.fillStyle = dirtColor;
    ctx.fillRect(0, y, W, 80);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (var i = 0; i < W; i += 8) {
      for (var j = 0; j < 80; j += 12) {
        if (Math.random() > 0.6) {
          ctx.fillRect(i + Math.random() * 6, y + j + Math.random() * 10, 3, 2);
        }
      }
    }
  }

  var SKELETON_BAND_TOP = 40, SKELETON_BAND_H = 30;
  var SKELETON_COUNT = 2;
  var SKELETON_GAP = W / SKELETON_COUNT;

  function spawnSkeleton(fromRight, slot) {
    var base = slot != null ? slot * SKELETON_GAP : W + Math.random() * 60;
    return {
      x: base + Math.random() * (SKELETON_GAP * 0.6),
      y: GROUND_Y + 3 + SKELETON_BAND_TOP + Math.random() * SKELETON_BAND_H,
      flip: Math.random() < 0.5,
      scale: 0.8 + Math.random() * 0.5
    };
  }

  // a small headstone, standing on the grass line, engraved with "RIP"
  var GRAVE_STONE = [
    '..#######..',
    '.#########.',
    '###########',
    '###########',
    '###########',
    '###########',
    '###########',
    '###########',
    '###########',
    '###########',
    '###########',
    '###########',
    '###########',
    '###########'
  ];
  var GRAVE_W = 11, GRAVE_H = 14;
  var GRAVE_FONT = {
    R: ['##.', '#.#', '##.', '#.#', '#.#'],
    I: ['#', '#', '#', '#', '#'],
    P: ['##.', '#.#', '##.', '#..', '#..']
  };

  function drawGraveText(text, x, y, unit, color) {
    ctx.fillStyle = color;
    var cx = 0;
    for (var i = 0; i < text.length; i++) {
      var glyph = GRAVE_FONT[text.charAt(i)];
      if (!glyph) { cx += 2; continue; }
      for (var row = 0; row < glyph.length; row++) {
        var line = glyph[row];
        for (var col = 0; col < line.length; col++) {
          if (line.charAt(col) === '#') {
            ctx.fillRect(Math.round(x + (cx + col) * unit), Math.round(y + row * unit),
              Math.ceil(unit), Math.ceil(unit));
          }
        }
      }
      cx += glyph[0].length + 1;
    }
  }

  function drawGrave(x, bottom, scale, stoneColor, textColor) {
    var unit = 2 * scale;
    var left = x - (GRAVE_W * unit) / 2;
    var top = bottom - GRAVE_H * unit;
    drawMap(GRAVE_STONE, left, top, unit, stoneColor);
    drawGraveText('RIP', left + unit, top + 6 * unit, unit, textColor);
  }

  var GRAVE_COUNT = 1;
  var GRAVE_GAP = W / GRAVE_COUNT;

  function spawnGrave(fromRight, slot) {
    var base = slot != null ? slot * GRAVE_GAP : W + Math.random() * 100;
    return {
      x: base + Math.random() * (GRAVE_GAP * 0.6),
      scale: 0.8 + Math.random() * 0.4
    };
  }

  /* ---------------------------------------------------------------- colors */

  var DAY   = { bg: [135, 206, 235], fg: [83, 83, 83],   dim: [200, 200, 200] };  // sky blue
  var NIGHT = { bg: [26, 26, 46],    fg: [236, 236, 240], dim: [92, 92, 104] };
  var SHOE_RED = [231, 76, 60];      // red shoe
  var SHOE_WHITE = [255, 255, 255];  // white shoe
  var PILE_BROWN = [74, 42, 22];     // dark chocolate pile
  var PILE_HIGHLIGHT = [122, 74, 42]; // lighter swirl highlight
  var FLY_BLACK = [44, 44, 44];      // fly color
  var GRASS_GREEN = [34, 139, 34];   // grass green
  var DIRT_BROWN = [139, 69, 19];    // dirt brown
  var BONE_WHITE = [245, 222, 179];  // skeleton bone color
  var BONE_SOCKET = [50, 50, 50];    // eye socket color
  var STONE_GRAY = [150, 148, 145];  // headstone color
  var STONE_DARK = [90, 88, 86];     // engraved lettering color
  var C = { bg: '#87ceeb', fg: '#535353', dim: '#ccc' };

  function mix(a, b, t) {
    return 'rgb(' +
      Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  /* ----------------------------------------------------------------- audio */

  var audio = null, muted = false;

  function beep(freq, dur, type, vol) {
    if (muted) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      var o = audio.createOscillator(), g = audio.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      o.connect(g); g.connect(audio.destination);
      var t0 = audio.currentTime;
      g.gain.setValueAtTime(vol || 0.035, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }

  /* ----------------------------------------------------------------- state */

  var READY = 0, PLAYING = 1, OVER = 2;

  var state, speed, distance, score, milestone, milestoneT;
  var obstacles, clouds, stars, particles, speckles, skeletons, graves;
  var nextSpawnIn, lastWasFly, night, moonX, flash, overT, dustT;
  var paused = false, menuPause = false, boosting = false, boostMult = 1;
  var flyMult = 1, pileMult = 1;

  var hi = 0;
  try { hi = parseInt(localStorage.getItem('shoeRunHi'), 10) || 0; } catch (e) {}

  var player = {
    x: 60, y: GROUND_Y, vy: 0,
    onGround: true, ducking: false,
    coyote: 0, buffer: 0, runT: 0, dead: false
  };

  function reset(toReady) {
    state = toReady ? READY : PLAYING;
    speed = START_SPEED;
    distance = 0;
    score = 0;
    milestone = 0;
    milestoneT = 0;
    obstacles = [];
    particles = [];
    nextSpawnIn = 600;
    lastWasFly = false;
    flash = 0;
    overT = 0;
    dustT = 0;

    player.y = GROUND_Y;
    player.vy = 0;
    player.onGround = true;
    player.ducking = false;
    player.coyote = 0;
    player.buffer = 0;
    player.runT = 0;
    player.dead = false;

    if (!toReady && window.WYS && window.WYS.onRestart) window.WYS.onRestart();

    // rebuild the whole scene (day/night, scenery, background skeletons/graves)
    // so a restart truly starts over instead of continuing mid-scroll.
    night = 0;
    moonX = W * 0.75;
    clouds = [];
    for (var i = 0; i < 3; i++) {
      clouds.push({
        x: 200 + i * 240 + Math.random() * 120,
        y: 30 + Math.random() * 50,
        s: 0.7 + Math.random() * 0.5
      });
    }
    stars = [];
    for (var j = 0; j < 26; j++) {
      stars.push({
        x: Math.random() * W,
        y: 15 + Math.random() * 120,
        s: Math.random() < 0.3 ? 3 : 2,
        p: Math.random() * 6
      });
    }
    speckles = [];
    for (var k = 0; k < 40; k++) {
      speckles.push({
        x: Math.random() * W,
        y: GROUND_Y + 5 + Math.random() * 14,
        w: 2 + Math.random() * 10
      });
    }

    skeletons = [];
    for (var m = 0; m < SKELETON_COUNT; m++) skeletons.push(spawnSkeleton(false, m));

    graves = [];
    for (var n = 0; n < GRAVE_COUNT; n++) graves.push(spawnGrave(false, n));
  }

  reset(true);

  /* ----------------------------------------------------------------- input */

  function jump() {
    player.vy = -JUMP_V;
    player.onGround = false;
    player.coyote = 0;
    player.buffer = 0;
    beep(540, 0.08, 'square', 0.03);
  }

  function releaseJump() {
    if (player.vy < 0) player.vy *= JUMP_CUT;
  }

  function startOrJump() {
    if (state === READY) {
      state = PLAYING;
      jump();
    } else if (state === PLAYING) {
      player.buffer = BUFFER;
    } else if (state === OVER && overT > 0.4) {
      reset(false);
      beep(440, 0.07);
    }
  }

  var JUMP_KEYS = { Space: 1, ArrowUp: 1, KeyW: 1, Enter: 1 };
  var DUCK_KEYS = { ArrowDown: 1, KeyS: 1 };
  var BOOST_KEYS = { ArrowRight: 1 };

  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyM') { muted = !muted; return; }
    if (BOOST_KEYS[e.code]) {
      e.preventDefault();
      boosting = true;
      return;
    }
    if (JUMP_KEYS[e.code]) {
      e.preventDefault();
      if (!e.repeat) startOrJump();
    } else if (DUCK_KEYS[e.code]) {
      e.preventDefault();
      if (state === PLAYING) player.ducking = true;
      else startOrJump();
    }
  });

  window.addEventListener('keyup', function (e) {
    if (BOOST_KEYS[e.code]) {
      boosting = false;
      return;
    }
    if (JUMP_KEYS[e.code]) releaseJump();
    else if (DUCK_KEYS[e.code]) player.ducking = false;
  });

  function canvasY(ev) {
    var r = cvs.getBoundingClientRect();
    return (ev.clientY - r.top) / r.height * H;
  }

  cvs.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { cvs.setPointerCapture(e.pointerId); } catch (err) {}
    if (state === PLAYING && canvasY(e) > H * 0.72) player.ducking = true;
    else startOrJump();
  });
  cvs.addEventListener('pointerup', function () {
    player.ducking = false;
    releaseJump();
  });
  cvs.addEventListener('pointercancel', function () { player.ducking = false; });
  cvs.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('blur', function () { paused = true; });
  window.addEventListener('focus', function () { paused = false; });
  document.addEventListener('visibilitychange', function () {
    paused = document.hidden;
  });

  /* -------------------------------------------------------------- spawning */

  function spawn() {
    var ob;
    if (!lastWasFly && Math.random() < Math.min(0.95, 0.3 * flyMult)) {
      var roll = Math.random();
      // 16 -> must duck, 0 -> must hop, 55 -> free unless you jump into it
      var bottom = roll < 0.45 ? 16 : (roll < 0.85 ? 0 : 55);
      ob = {
        type: 'fly', x: W + 20, y: GROUND_Y - bottom - FLY_H,
        w: FLY_W, h: FLY_H, frame: 0, animT: 0, bobT: Math.random() * 6
      };
      lastWasFly = true;
    } else {
      var big = Math.random() < 0.45;
      var count = Math.random() < 0.5 ? 1 : (Math.random() < 0.7 ? 2 : 3);
      var unit = big ? 30 : 22;
      var h = big ? 32 : 19;
      // per-pile heights: the middle one slumps, and the hitboxes follow it
      var hs = [];
      for (var n = 0; n < count; n++) {
        hs.push(n === 1 ? Math.round(h * 0.78) : h);
      }
      ob = {
        type: 'pile', x: W + 20, y: GROUND_Y - h,
        w: unit * count, h: h, unit: unit, count: count, hs: hs
      };
      lastWasFly = false;
    }
    obstacles.push(ob);
    // minimum gap scales with speed so every hop stays makeable
    nextSpawnIn = (ob.w + speed * 0.78 + 40 + Math.random() * speed * 0.85) / pileMult;
  }

  /* ------------------------------------------------------------- collision */

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function playerBoxes() {
    if (player.ducking && player.onGround) {
      var dtop = player.y - DUCK_H;
      return [[player.x + 5, dtop + 2, DUCK_W - 10, DUCK_H - 4]];
    }
    var top = player.y - SHOE_H;
    return [[player.x + 4, top + 4, SHOE_W - 8, SHOE_H - 7]];
  }

  function obstacleBoxes(o) {
    if (o.type === 'fly') return [[o.x + 6, o.y + 5, o.w - 12, o.h - 10]];
    var out = [];
    for (var n = 0; n < o.count; n++) {
      var hh = o.hs[n];
      var px = o.x + n * o.unit;
      // wide base plus a narrower box for the tapered top of the pile
      out.push([px + 3, GROUND_Y - hh * 0.55, o.unit - 6, hh * 0.55]);
      out.push([px + o.unit * 0.26, GROUND_Y - hh + 2, o.unit * 0.48, hh * 0.45]);
    }
    return out;
  }

  function die() {
    state = OVER;
    overT = 0;
    flash = 1;
    player.dead = true;
    player.ducking = false;
    if (score > hi) {
      hi = score;
      try { localStorage.setItem('shoeRunHi', String(hi)); } catch (e) {}
    }
    beep(200, 0.16, 'square', 0.05);
    setTimeout(function () { beep(120, 0.32, 'sawtooth', 0.05); }, 110);

    if (window.WYS && window.WYS.onGameOver) window.WYS.onGameOver();

    var cx = player.x + SHOE_W / 2, cy = player.y - SHOE_H / 2;
    for (var i = 0; i < 16; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 190;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp - speed * 0.25,
        vy: Math.sin(a) * sp - 90,
        life: 0.5 + Math.random() * 0.5,
        size: 2 + Math.round(Math.random() * 2) * 2,
        dim: false
      });
    }
  }

  /* ---------------------------------------------------------------- update */

  function update(dt) {
    // scenery drifts a little even on the ready screen
    boostMult = boosting ? 2 : 1;
    var scroll = (state === PLAYING ? speed * boostMult : state === READY ? START_SPEED * 0.35 : 0) * dt;

    for (var ci = 0; ci < clouds.length; ci++) {
      var c = clouds[ci];
      c.x -= scroll * 0.22 * c.s;
      if (c.x < -120) {
        c.x = W + Math.random() * 220;
        c.y = 24 + Math.random() * 58;
        c.s = 0.7 + Math.random() * 0.5;
      }
    }

    for (var si = 0; si < speckles.length; si++) {
      var sk = speckles[si];
      sk.x -= scroll;
      if (sk.x + sk.w < 0) {
        sk.x = W + Math.random() * 60;
        sk.y = GROUND_Y + 5 + Math.random() * 14;
        sk.w = 2 + Math.random() * 10;
      }
    }

    for (var mi = 0; mi < skeletons.length; mi++) {
      var mk = skeletons[mi];
      mk.x -= scroll;
      if (mk.x < -40) skeletons[mi] = spawnSkeleton(true);
    }

    for (var gi = 0; gi < graves.length; gi++) {
      var gv = graves[gi];
      gv.x -= scroll;
      if (gv.x < -30) graves[gi] = spawnGrave(true);
    }

    moonX -= scroll * 0.04;
    if (moonX < -60) moonX = W + 60;

    for (var pi = particles.length - 1; pi >= 0; pi--) {
      var p = particles[pi];
      p.life -= dt;
      p.vy += (p.dim ? 260 : 1400) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) particles.splice(pi, 1);
    }

    if (flash > 0) flash = Math.max(0, flash - dt * 7);
    if (milestoneT > 0) milestoneT -= dt;
    if (state === OVER) overT += dt;

    if (state !== PLAYING) {
      if (state === READY) player.runT += dt * 0.9;
      return;
    }

    // ---- world
    var maxSpeed = boosting ? MAX_SPEED * 2 : MAX_SPEED;
    speed = Math.min(maxSpeed, speed + ACCEL * dt);
    distance += speed * dt;

    var newScore = Math.floor(distance / 40);
    if (Math.floor(newScore / 100) > milestone) {
      milestone = Math.floor(newScore / 100);
      milestoneT = 1.1;
      beep(880, 0.07, 'square', 0.03);
      setTimeout(function () { beep(1180, 0.09, 'square', 0.03); }, 90);
    }
    score = newScore;

    var target = Math.floor(score / NIGHT_EVERY) % 2 === 1 ? 1 : 0;
    night += Math.max(-dt / 1.4, Math.min(dt / 1.4, target - night));

    // ---- player
    player.coyote = player.onGround ? COYOTE : Math.max(0, player.coyote - dt);
    player.buffer = Math.max(0, player.buffer - dt);

    if (player.buffer > 0 && (player.onGround || player.coyote > 0)) jump();

    if (!player.onGround) {
      var g = GRAVITY * (player.ducking && player.vy > 0 ? FAST_FALL : 1);
      player.vy += g * dt;
      player.y += player.vy * dt;
      if (player.y >= GROUND_Y) {
        player.y = GROUND_Y;
        player.vy = 0;
        player.onGround = true;
      }
    }

    player.runT += dt * (speed / START_SPEED);

    // little dust kicks off the heel while running
    if (player.onGround) {
      dustT -= dt;
      if (dustT <= 0) {
        dustT = 0.07;
        particles.push({
          x: player.x + 4, y: GROUND_Y - 3,
          vx: -speed * 0.30 - Math.random() * 40,
          vy: -30 - Math.random() * 50,
          life: 0.22 + Math.random() * 0.2,
          size: 2, dim: true
        });
      }
    }

    // ---- obstacles
    nextSpawnIn -= speed * boostMult * dt;
    if (nextSpawnIn <= 0) spawn();

    var boxes = playerBoxes();
    for (var oi = obstacles.length - 1; oi >= 0; oi--) {
      var o = obstacles[oi];
      o.x -= speed * boostMult * (o.type === 'fly' ? 1.18 : 1) * dt;
      if (o.type === 'fly') {
        o.animT += dt;
        o.frame = Math.floor(o.animT * 9) % 2;
        o.bobT += dt;
      }
      if (o.x + o.w < -20) { obstacles.splice(oi, 1); continue; }

      var obs = obstacleBoxes(o);
      for (var bi = 0; bi < boxes.length; bi++) {
        var b = boxes[bi];
        for (var xi = 0; xi < obs.length; xi++) {
          var ob = obs[xi];
          if (overlap(b[0], b[1], b[2], b[3], ob[0], ob[1], ob[2], ob[3])) {
            die();
            return;
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------------- render */

  var FONT_S = '700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var FONT_M = '700 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var FONT_L = '700 20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  function pad(n) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < 5) s = '0' + s;
    return s;
  }

  function drawOutlinedText(text, x, y) {
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y);
  }

  function render() {
    C.bg = mix(DAY.bg, NIGHT.bg, night);
    C.fg = mix(DAY.fg, NIGHT.fg, night);
    C.dim = mix(DAY.dim, NIGHT.dim, night);

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // ---- sky
    if (night > 0.04) {
      var now = performance.now();
      ctx.fillStyle = C.dim;
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i];
        ctx.globalAlpha = night * (0.55 + 0.45 * Math.sin(st.p + now / 700));
        ctx.fillRect(Math.round(st.x), Math.round(st.y), st.s, st.s);
      }
      ctx.globalAlpha = night;
      ctx.fillStyle = C.dim;
      ctx.beginPath();
      ctx.arc(moonX, 52, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.bg;
      ctx.beginPath();
      ctx.arc(moonX - 8, 47, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (var ci = 0; ci < clouds.length; ci++) {
      drawCloud(clouds[ci].x, clouds[ci].y, clouds[ci].s, C.dim);
    }

    // ---- ground
    var grassColor = mix(GRASS_GREEN, night > 0.5 ? [20, 80, 20] : GRASS_GREEN, Math.min(night, 0.5) * 2);
    var dirtColor = mix(DIRT_BROWN, night > 0.5 ? [60, 40, 20] : DIRT_BROWN, Math.min(night, 0.5) * 2);

    ctx.fillStyle = grassColor;
    ctx.fillRect(0, GROUND_Y, W, 3);

    var stoneColor = mix(STONE_GRAY, night > 0.5 ? [70, 70, 78] : STONE_GRAY, Math.min(night, 0.5) * 2);
    var stoneTextColor = mix(STONE_DARK, night > 0.5 ? [30, 30, 34] : STONE_DARK, Math.min(night, 0.5) * 2);
    for (var gi = 0; gi < graves.length; gi++) {
      var gv = graves[gi];
      drawGrave(Math.round(gv.x), GROUND_Y, gv.scale, stoneColor, stoneTextColor);
    }

    var boneColor = mix(BONE_WHITE, night > 0.5 ? [140, 120, 80] : BONE_WHITE, Math.min(night, 0.5) * 2);
    var eyeColor = mix(BONE_SOCKET, night > 0.5 ? [20, 20, 20] : BONE_SOCKET, Math.min(night, 0.5) * 2);
    drawGraveyardGround(GROUND_Y + 3, dirtColor);
    for (var ki = 0; ki < skeletons.length; ki++) {
      var k = skeletons[ki];
      drawSkeletonCorpse(Math.round(k.x), Math.round(k.y), k.flip, k.scale, boneColor, eyeColor);
    }

    ctx.fillStyle = C.dim;
    for (var si = 0; si < speckles.length; si++) {
      var sk = speckles[si];
      ctx.fillRect(Math.round(sk.x), Math.round(sk.y), Math.round(sk.w), 2);
    }

    // ---- obstacles
    for (var oi = 0; oi < obstacles.length; oi++) {
      var o = obstacles[oi];
      if (o.type === 'fly') {
        var bob = Math.round(Math.sin(o.bobT * 7) * 2);
        drawFly(Math.round(o.x), Math.round(o.y) + bob, o.frame, C.fg);
      } else {
        for (var n = 0; n < o.count; n++) {
          var hh = o.hs[n];
          var pileColor = mix(PILE_BROWN, night > 0.5 ? [30, 20, 12] : PILE_BROWN, Math.min(night, 0.5) * 2);
          var pileHighlight = mix(PILE_HIGHLIGHT, night > 0.5 ? [55, 40, 25] : PILE_HIGHLIGHT, Math.min(night, 0.5) * 2);
          drawPile(Math.round(o.x + n * o.unit), GROUND_Y - hh, o.unit, hh, pileColor, pileHighlight);
        }
      }
    }

    // ---- player
    var map, cuts, px, py;
    if (player.ducking && player.onGround && state === PLAYING) {
      map = (Math.floor(player.runT * 11) % 2 === 0) ? DUCK_A : DUCK_B;
      cuts = DUCK_CUTS;
      py = player.y - DUCK_H;
    } else {
      if (state === PLAYING && player.onGround) {
        map = (Math.floor(player.runT * 11) % 2 === 0) ? SHOE_RUN_A : SHOE_RUN_B;
      } else if (state === READY) {
        map = (Math.floor(player.runT * 3) % 2 === 0) ? SHOE_STAND : SHOE_RUN_A;
      } else {
        map = SHOE_STAND;
      }
      cuts = SHOE_CUTS;
      py = player.y - SHOE_H;
    }
    px = Math.round(player.x);
    py = Math.round(py);
    // Draw shoe in red
    var shoeColor = mix(SHOE_RED, night > 0.5 ? [90, 30, 20] : SHOE_RED, Math.min(night, 0.5) * 2);
    drawMap(map, px, py, PX, shoeColor);
    drawCuts(cuts, px, py, PX, '#ffffff');

    // ---- particles
    for (var pi = 0; pi < particles.length; pi++) {
      var p = particles[pi];
      ctx.fillStyle = p.dim ? C.dim : C.fg;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.5));
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // ---- hud
    ctx.font = FONT_M;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    if (hi > 0) {
      drawOutlinedText('HI ' + pad(hi), W - 116, 18);
    }
    if (!(milestoneT > 0 && Math.floor(milestoneT * 7) % 2 === 0)) {
      drawOutlinedText(pad(score), W - 24, 18);
    }
    if (state === PLAYING) {
      var displaySpeed = Math.round(speed * boostMult);
      drawOutlinedText(displaySpeed + ' px/s', W - 24, 38);
    }
    if (muted) {
      ctx.textAlign = 'left';
      drawOutlinedText('MUTED', 24, 18);
    }
    if (boosting && state === PLAYING) {
      ctx.textAlign = 'left';
      drawOutlinedText('BOOST', 24, 18);
    }

    // ---- overlays
    ctx.textAlign = 'center';
    if (state === READY) {
      ctx.font = '700 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      drawOutlinedText('PRESS SPACE TO START', W / 2, 92);
      ctx.font = FONT_S;
      drawOutlinedText('WATCH YOUR STEP', W / 2, 118);
    } else if (state === OVER) {
      ctx.font = FONT_L;
      drawOutlinedText('G A M E   O V E R', W / 2, 72);
      ctx.font = FONT_S;
      drawOutlinedText('YOU STEPPED IN IT', W / 2, 102);
      if (overT > 0.4 && Math.floor(overT * 1.6) % 2 === 0) {
        drawOutlinedText('PRESS SPACE TO RESTART', W / 2, 124);
      }
    }

    if (flash > 0) {
      ctx.globalAlpha = flash * 0.4;
      ctx.fillStyle = C.fg;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  /* ------------------------------------------------------------------ loop */

  var last = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (!last) last = t;
    var dt = (t - last) / 1000;
    last = t;
    if (paused || menuPause) { render(); return; }
    if (dt > 0.05) dt = 0.05;   // clamp so a stalled tab cannot teleport you
    update(dt);
    render();
  }
  requestAnimationFrame(frame);

  /* --------------------------------------------------------- slider controls */

  var flySlider = document.getElementById('fly-slider');
  var pileSlider = document.getElementById('pile-slider');
  var flyValue = document.getElementById('fly-value');
  var pileValue = document.getElementById('pile-value');

  function paintSliderFill(slider, fillVar, emptyVar) {
    var css = getComputedStyle(document.documentElement);
    var fill = css.getPropertyValue(fillVar).trim();
    var empty = css.getPropertyValue(emptyVar).trim();
    var min = parseFloat(slider.min);
    var max = parseFloat(slider.max);
    var pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
    slider.style.background = 'linear-gradient(to right, ' + fill + ' 0%, ' + fill + ' ' + pct + '%, ' + empty + ' ' + pct + '%, ' + empty + ' 100%)';
  }

  flySlider.addEventListener('input', function () {
    flyMult = parseFloat(flySlider.value);
    flyValue.textContent = flyMult.toFixed(1);
    paintSliderFill(flySlider, '--fly-dark', '--fly-track-empty');
  });

  pileSlider.addEventListener('input', function () {
    pileMult = parseFloat(pileSlider.value);
    pileValue.textContent = pileMult.toFixed(1);
    paintSliderFill(pileSlider, '--pile-brown', '--pile-track-empty');
  });

  paintSliderFill(flySlider, '--fly-dark', '--fly-track-empty');
  paintSliderFill(pileSlider, '--pile-brown', '--pile-track-empty');

  /* ------------------------------------------------------------ external API */

  window.WYS = window.WYS || {};
  window.WYS.pause = function () { menuPause = true; };
  window.WYS.resume = function () { menuPause = false; };
  window.WYS.restart = function () { reset(false); menuPause = false; };
  window.WYS.backToReady = function () { reset(true); menuPause = false; };
})();
