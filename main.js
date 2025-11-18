(function () {
  const $  = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const rand = n => Math.floor(Math.random() * n);
  const deepCopy = obj => JSON.parse(JSON.stringify(obj));
  function clearNode(node){ while(node.firstChild) node.removeChild(node.firstChild); }

  const SIZE = 4;
  const KEY  = 'vanilla-2048-state-v1';
  const LKEY = 'vanilla-2048-leaderboard-v1';
  const GAP  = 12; 

  let state = {
    grid: Array.from({ length: SIZE }, () => Array(SIZE).fill(0)),
    score: 0,
    best: Number(localStorage.getItem('best-2048') || 0),
    over: false,
    idCounter: 1,
    history: []
  };

  let tilesMap = new Map();

  const boardEl    = $('#board');
  const tilesLayer = $('#tiles');
  const scoreEl    = $('#score');
  const bestEl     = $('#best');

  const headerEl = document.querySelector('header');
  const tabsEl   = document.querySelector('.tabs');
  const ctrlsEl  = document.querySelector('#game .controls');

  function renderCells(){
    clearNode(boardEl);
    for(let i=0;i<SIZE*SIZE;i++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      boardEl.appendChild(cell);
    }
  }

  function getInnerWidth() {
    const cs = getComputedStyle(boardEl);
    const paddingLeft  = parseFloat(cs.paddingLeft)  || 0;
    const paddingRight = parseFloat(cs.paddingRight) || 0;
    const inner = boardEl.clientWidth - paddingLeft - paddingRight;
    return inner > 0 ? inner : tilesLayer.clientWidth; 
  }

  function pos(x,y){
    const inner = getInnerWidth();
    const cellSize = inner > 0 ? (inner - GAP*3) / 4 : 0;
    return { left: (cellSize+GAP)*x, top: (cellSize+GAP)*y };
  }
  function tileClass(value){ const cap = value>4096?4096:value; return `tile v${cap}`; }


  function renderTiles(animateNewIds=new Set(), mergeIds=new Set()){
    if (getInnerWidth() <= 0) { 
      requestAnimationFrame(() => renderTiles(animateNewIds, mergeIds));
      return;
    }
    clearNode(tilesLayer);
    tilesMap.forEach((t,id)=>{
      const el = document.createElement('div');
      el.className = tileClass(t.value);
      if(animateNewIds.has(id)) el.classList.add('new');
      if(mergeIds.has(id)) el.classList.add('merge');
      const {left,top} = pos(t.x,t.y);
      el.style.transform = `translate(${left}px, ${top}px)`;
      el.textContent = t.value;
      tilesLayer.appendChild(el);
      t.el = el;
    });
  }

  function fitBoardToViewport(){
    const topH =
      (headerEl?.offsetHeight || 0) +
      (tabsEl?.offsetHeight || 0) +
      (ctrlsEl?.offsetHeight || 0);

    const margins = 60; 
    const availH = window.innerHeight - topH - margins;
    const availW = window.innerWidth - 40;

    const size = Math.max(260, Math.min(520, Math.min(availH, availW)));
    document.documentElement.style.setProperty('--boardSize', size + 'px');

    tilesMap.forEach(t=>{
      const {left,top} = pos(t.x,t.y);
      if(t.el) t.el.style.transform = `translate(${left}px, ${top}px)`;
    });
  }


  function emptyCells(){
    const arr=[]; for(let y=0;y<SIZE;y++) for(let x=0;x<SIZE;x++) if(state.grid[y][x]===0) arr.push({x,y});
    return arr;
  }
  function spawn(count=1){
    const spots = emptyCells();
    const n = Math.min(count, spots.length);
    const newIds = new Set();
    for(let i=0;i<n;i++){
      const {x,y} = spots.splice(rand(spots.length),1)[0];
      const v = Math.random()<0.9?2:4;
      state.grid[y][x] = v;
      const id = state.idCounter++;
      tilesMap.set(id,{id,value:v,x,y});
      newIds.add(id);
    }
    renderTiles(newIds);
  }
  function canMove(){
    if(emptyCells().length>0) return true;
    for(let y=0;y<SIZE;y++){
      for(let x=0;x<SIZE;x++){
        const v = state.grid[y][x];
        if(x<SIZE-1 && state.grid[y][x+1]===v) return true;
        if(y<SIZE-1 && state.grid[y+1][x]===v) return true;
      }
    }
    return false;
  }
  function lineMove(line){
    const nums = line.filter(n=>n!==0);
    let scoreGain = 0; const result=[];
    for(let i=0;i<nums.length;i++){
      if(i<nums.length-1 && nums[i]===nums[i+1]){ const merged = nums[i]*2; result.push(merged); scoreGain += merged; i++; }
      else{ result.push(nums[i]); }
    }
    while(result.length<SIZE) result.push(0);
    return {result, scoreGain};
  }
  const transpose   = g => g[0].map((_,i)=>g.map(r=>r[i]));
  const reverseRows = g => g.map(r=>r.slice().reverse());
  const gridEqual   = (a,b)=>a.every((r,y)=>r.every((v,x)=>v===b[y][x]));


  function snapshot(){
    return { grid: deepCopy(state.grid), score: state.score, idCounter: state.idCounter, tiles: JSON.stringify(Array.from(tilesMap.entries())) };
  }
  function restore(snap){
    state.grid = deepCopy(snap.grid); state.score = snap.score; state.idCounter = snap.idCounter;
    tilesMap = new Map(JSON.parse(snap.tiles)); updateUI();
  }


  function move(dir){
    if(state.over) return;
    const prev = snapshot();

    let g = deepCopy(state.grid), rotate=0;
    if(dir==='up'){ g = transpose(g); rotate=1; }
    else if(dir==='right'){ g = reverseRows(g); rotate=2; }
    else if(dir==='down'){ g = reverseRows(transpose(g)); rotate=3; }

    let scoreGainTotal = 0;
    const beforePositions = new Map();
    tilesMap.forEach((t,id)=>{ beforePositions.set(`${t.y},${t.x}`, id); });

    const newGrid=[]; for(let y=0;y<SIZE;y++){ const {result,scoreGain} = lineMove(g[y]); newGrid.push(result); scoreGainTotal += scoreGain; }

    let out = newGrid;
    if(rotate===1) out = transpose(out);
    else if(rotate===2) out = reverseRows(out);
    else if(rotate===3) out = transpose(reverseRows(out));

    if(gridEqual(state.grid,out)) return;

    const mergesToAnimate = new Set();
    const newTiles = new Map();
    for(let y=0;y<SIZE;y++){
      for(let x=0;x<SIZE;x++){
        const v = out[y][x]; if(v===0) continue;
        let origins=[];
        function scan(dx,dy){
          let cx=x, cy=y;
          while(true){
            cx-=dx; cy-=dy;
            if(cx<0||cy<0||cx>=SIZE||cy>=SIZE) break;
            const key = `${cy},${cx}`;
            const id = beforePositions.get(key);
            if(id){
              const t = tilesMap.get(id);
              if(t && t.value<=v && (origins.length===0 || t.value===origins[0].value)){
                origins.push({id,t}); if(origins.length===2) break;
              } else break;
            }
          }
        }
        if(dir==='left')  scan(1,0);
        if(dir==='right') scan(-1,0);
        if(dir==='up')    scan(0,1);
        if(dir==='down')  scan(0,-1);

        let tileId;
        if(origins.length===2 && origins[0].t.value===origins[1].t.value && origins[0].t.value*2===v){
          tileId = state.idCounter++; mergesToAnimate.add(tileId);
        } else if(origins.length>=1){ tileId = origins[0].id; }
        else { tileId = state.idCounter++; }
        newTiles.set(tileId,{id:tileId,value:v,x,y});
      }
    }

    state.grid = out;
    state.score += scoreGainTotal;
    state.best = Math.max(state.best, state.score);
    localStorage.setItem('best-2048', String(state.best));

    state.history.push(prev);
    $('#undoBtn').disabled = state.history.length===0;
    $('#undoBtnMobile').disabled = $('#undoBtn').disabled;

    tilesMap = newTiles;
    renderTiles(new Set(), mergesToAnimate);

    const addCount = Math.random()<0.3?2:1;
    spawn(addCount);

    updateUI();
    if(!canMove()) gameOver();
  }


  function updateUI(){ scoreEl.textContent = state.score; bestEl.textContent = state.best; persist(); }
  function reset(){
    state.grid = Array.from({length:SIZE},()=>Array(SIZE).fill(0));
    state.score=0; state.over=false; state.history=[]; state.idCounter=1;
    tilesMap = new Map(); renderTiles();
    $('#undoBtn').disabled = true; $('#undoBtnMobile').disabled = true;
    const start = 1 + rand(3); spawn(start); updateUI();
    fitBoardToViewport(); 
  }
  function persist(){
    const serialTiles = Array.from(tilesMap.entries());
    localStorage.setItem(KEY, JSON.stringify({grid:state.grid, score:state.score, best:state.best, over:state.over, idCounter:state.idCounter, tiles:serialTiles}));
  }
  function load(){
    const raw = localStorage.getItem(KEY); if(!raw) return false;
    try{
      const data = JSON.parse(raw);
      state.grid = data.grid; state.score = data.score; state.best = data.best||0; state.over = !!data.over; state.idCounter = data.idCounter||1;
      tilesMap = new Map(data.tiles||[]); renderTiles(); updateUI(); return true;
    }catch{ return false; }
  }

  function gameOver(){
    state.over = true; persist();
    $('#finalScore').textContent = state.score;
    $('#playerName').value = ''; $('#saveBlock').classList.remove('hidden'); $('#savedMsg').classList.add('hidden');
    $('#gameOver').classList.add('show');
    $('#undoBtn').disabled = true; $('#undoBtnMobile').disabled = true;
  }
  function saveResult(){
    const name = ($('#playerName').value || 'Без имени').trim().slice(0,30);
    const list = JSON.parse(localStorage.getItem(LKEY) || '[]');
    list.push({name, score: state.score, date: new Date().toISOString()});
    list.sort((a,b)=>b.score-a-score);
  }

  function saveResult(){
    const name = ($('#playerName').value || 'Без имени').trim().slice(0,30);
    const list = JSON.parse(localStorage.getItem(LKEY) || '[]');
    list.push({name, score: state.score, date: new Date().toISOString()});
    list.sort((a,b)=>b.score-a.score);
    localStorage.setItem(LKEY, JSON.stringify(list.slice(0,10)));
    $('#saveBlock').classList.add('hidden');
    $('#savedMsg').classList.remove('hidden');
    renderLeaders();
  }
  function renderLeaders(){
    const tbody = $('#leaderRows'); clearNode(tbody);
    const list = JSON.parse(localStorage.getItem(LKEY) || '[]');
    if(list.length===0){
      const tr=document.createElement('tr'); const td=document.createElement('td');
      td.colSpan=4; td.className='muted'; td.textContent='Пока пусто'; tr.appendChild(td); tbody.appendChild(tr); return;
    }
    list.forEach((r,i)=>{
      const tr=document.createElement('tr');
      const c1=document.createElement('td'); c1.textContent=String(i+1);
      const c2=document.createElement('td'); c2.textContent=r.name;
      const c3=document.createElement('td'); c3.textContent=String(r.score);
      const c4=document.createElement('td'); c4.textContent=new Date(r.date).toLocaleString();
      tr.append(c1,c2,c3,c4); tbody.appendChild(tr);
    });
  }


  const keyMap = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down', a:'left', d:'right', w:'up', s:'down' };
  window.addEventListener('keydown', e=>{ const dir = keyMap[e.key]; if(dir){ e.preventDefault(); move(dir);} });

  $('#restartBtn').addEventListener('click', ()=>reset());
  $('#againBtn').addEventListener('click', ()=>{ $('#gameOver').classList.remove('show'); reset(); });
  $('#undoBtn').addEventListener('click', ()=>undo());
  $('#undoBtnMobile').addEventListener('click', ()=>undo());
  $('#mobileCtrls').addEventListener('click', e=>{ const b=e.target.closest('button[data-dir]'); if(b) move(b.dataset.dir); });

  (function enableSwipe(){
    let sx=0, sy=0, dx=0, dy=0, touching=false;
    const target = boardEl;
    target.addEventListener('touchstart', e=>{ if(!e.touches[0]) return; touching=true; sx=e.touches[0].clientX; sy=e.touches[0].clientY; }, {passive:true});
    target.addEventListener('touchmove', e=>{ if(!touching||!e.touches[0]) return; dx=e.touches[0].clientX-sx; dy=e.touches[0].clientY-sy; }, {passive:true});
    target.addEventListener('touchend', ()=>{ if(!touching) return; touching=false; const ax=Math.abs(dx), ay=Math.abs(dy); if(Math.max(ax,ay)<24) return; if(ax>ay) move(dx>0?'right':'left'); else move(dy>0?'down':'up'); dx=dy=0; });
  })();

  function undo(){ if(state.over) return; const snap=state.history.pop(); if(!snap) return; restore(snap); $('#undoBtn').disabled = state.history.length===0; $('#undoBtnMobile').disabled = $('#undoBtn').disabled; }

  $$('.tab').forEach(t=>t.addEventListener('click', ()=>{
    $$('.tab').forEach(z=>z.classList.remove('active')); t.classList.add('active');
    const id=t.dataset.section; $$('.section').forEach(s=>s.classList.remove('active')); $('#'+id).classList.add('active');
    $('#mobileCtrls').style.visibility = (id==='game') ? 'visible' : 'hidden';
    fitBoardToViewport();
  }));

  $('#saveScore').addEventListener('click', saveResult);

  renderCells();
  renderLeaders();


  requestAnimationFrame(() => {
    fitBoardToViewport();
    if(!load()) reset();
  });

  window.addEventListener('resize', () => {
    fitBoardToViewport();
    renderTiles();
  });
})();
