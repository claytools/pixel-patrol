(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;

  const ui = {
    app: $('app'), score: $('score'), level: $('level'), lives: $('lives'), power: $('power'),
    start: $('startOverlay'), upgrades: $('upgradeOverlay'), over: $('gameOverOverlay'),
    levelCard: $('levelOverlay'), startBtn: $('startButton'), continueBtn: $('continueButton'),
    againBtn: $('playAgainButton'), saveBtn: $('saveScoreButton'), fullscreenBtn: $('fullscreenButton'),
    initials: $('initials'), final: $('finalScore'), board: $('leaderboard'),
    upgradeScore: $('upgradeScore'), upgradeChoices: $('upgradeChoices'),
    touchLeft: $('touchLeft'), touchRight: $('touchRight'), touchFire: $('touchFire')
  };

  const keys = new Set();
  const shots = [], enemyShots = [], invaders = [], particles = [], stars = [];
  const colors = ['#61e9ff', '#a9ff68', '#ff7edb', '#ff9d5c', '#b893ff'];
  const player = { x: W/2, y: H-56, w:44, h:26, speed:340, invuln:0 };

  let playing=false, paused=false, shopping=false, score=1000, lives=10, level=1, last=0;
  let direction=1, enemySpeed=32, enemyFire=0, fireCooldown=0, bonus=null, bonusTimer=6, flash=0;
  let upgrades = { fireRate:0, bulletSpeed:0, spread:0, power:0 };

  const upgradeDefs = [
    { key:'fireRate', name:'Rapid Fire', desc:'Shoot more often.', base:100, step:125, max:10 },
    { key:'bulletSpeed', name:'Hyper Bolts', desc:'Shots travel faster.', base:100, step:150, max:10 },
    { key:'spread', name:'Multi-Shot', desc:'Adds more angled side shots as it levels up.', base:200, step:250, max:10 },
    { key:'power', name:'Plasma Power', desc:'Stronger shots do more damage and punch through enemies.', base:250, step:300, max:10 }
  ];

  function upgradeCost(def) { return def.base + def.step * upgrades[def.key]; }

  function hud() {
    ui.score.textContent = Math.floor(score);
    ui.level.textContent = level;
    ui.lives.textContent = lives;
    ui.power.textContent = 1 + upgrades.power;
  }

  function makeStars() {
    let seed=1337;
    const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    for(let i=0;i<125;i++) stars.push({x:rnd()*W,y:rnd()*H,s:rnd()<.84?1:2,a:.35+rnd()*.65});
  }

  function stats(row) {
    if(row===0) return {kind:'brute',points:400,scale:1.24,hp:2};
    if(row<=2) return {kind:'striker',points:200,scale:1,hp:1};
    return {kind:'scout',points:100,scale:.82,hp:1};
  }

  function showLevel() {
    ui.levelCard.textContent=`LEVEL ${level}`;
    ui.levelCard.classList.add('shown');
    setTimeout(()=>ui.levelCard.classList.remove('shown'),900);
  }

  function wave() {
    invaders.length=shots.length=enemyShots.length=0;
    direction=1;
    enemySpeed=32+(level-1)*8;
    const rows=Math.min(5+Math.floor((level-1)/3),7);
    const cols=Math.min(9+Math.floor((level-1)/2),12);
    const gapX=67,gapY=54,startX=W/2-((cols-1)*gapX)/2;

    for(let r=0;r<rows;r++){
      const s=stats(r);
      for(let c=0;c<cols;c++) invaders.push({
        x:startX+c*gapX,y:95+r*gapY,w:36*s.scale,h:26*s.scale,row:r,col:c,
        kind:s.kind,points:s.points,color:colors[r%colors.length],alive:true,hp:s.hp,maxHp:s.hp
      });
    }

    shopping=false;
    ui.upgrades.classList.remove('shown');
    showLevel();
  }

  function reset() {
    score=1000; lives=10; level=1; paused=false; shopping=false;
    upgrades={fireRate:0,bulletSpeed:0,spread:0,power:0};
    player.x=W/2; player.invuln=0;
    particles.length=0; bonus=null; bonusTimer=6;
    wave(); hud();
  }

  function start() {
    reset(); playing=true;
    ui.start.classList.remove('shown');
    ui.over.classList.remove('shown');
    ui.upgrades.classList.remove('shown');
    last=performance.now();
  }

  function gameOver() {
    playing=false; shopping=false;
    ui.final.textContent=Math.floor(score);
    ui.initials.value='';
    ui.over.classList.add('shown');
    setTimeout(()=>ui.initials.focus(),50);
  }

  function overlap(a,b){
    return a.x-a.w/2 < b.x+b.w/2 && a.x+a.w/2 > b.x-b.w/2 &&
           a.y-a.h/2 < b.y+b.h/2 && a.y+a.h/2 > b.y-b.h/2;
  }

  function burst(x,y,color,count=12){
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2,speed=45+Math.random()*170;
      particles.push({
        x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
        life:.35+Math.random()*.45,color,size:2+Math.random()*3
      });
    }
  }

  function fire() {
    if(!playing||paused||shopping||fireCooldown>0) return;

    const speed = 560 + upgrades.bulletSpeed * 75;
    const damage = 1 + upgrades.power;
    const pierce = Math.floor(upgrades.power / 2);
    const addShot = (vx=0, offset=0) => shots.push({
      x:player.x+offset,y:player.y-24,w:4,h:14,vx,vy:-speed,damage,pierce
    });

    addShot();

    const pairs = Math.min(5, Math.ceil(upgrades.spread / 2));
    for(let p=1; p<=pairs; p++){
      const vx = 55 + p * 48;
      const offset = 3 + p * 4;
      addShot(-vx, -offset);
      addShot(vx, offset);
    }

    if(upgrades.spread > 0 && upgrades.spread % 2 === 1){
      for(const s of shots.slice(-1 - pairs*2)) s.vx *= 1.12;
    }

    fireCooldown=Math.max(.04,.22-upgrades.fireRate*.018);
  }

  function shooter() {
    const front=new Map();
    for(const i of invaders) if(i.alive){
      const current=front.get(i.col);
      if(!current||i.y>current.y) front.set(i.col,i);
    }
    const choices=[...front.values()];
    return choices[Math.floor(Math.random()*choices.length)];
  }

  function hitPlayer() {
    if(player.invuln>0) return;
    lives--;
    player.invuln=1.6;
    flash=.18;
    burst(player.x,player.y,'#fff',24);
    hud();
    if(lives<=0) gameOver();
  }

  function openUpgradeBay() {
    shopping=true;
    shots.length=0;
    enemyShots.length=0;
    score += 150 * (level + 1);
    level++;
    hud();
    renderUpgrades();
    ui.upgrades.classList.add('shown');
  }

  function makeProgress(current, max=10, life=false) {
    const wrap=document.createElement('div');
    wrap.className='upgrade-progress';
    wrap.setAttribute('aria-label', `${current} of ${max} unlocked`);
    for(let i=1;i<=max;i++){
      const pip=document.createElement('span');
      pip.className='upgrade-pip' + (i<=current?' filled':'') + (life?' life':'');
      pip.title=`Level ${i}`;
      wrap.appendChild(pip);
    }
    return wrap;
  }

  function renderUpgrades() {
    ui.upgradeScore.textContent=Math.floor(score);
    ui.upgradeChoices.innerHTML='';

    {
      const lifeCost = 500;
      const maxed = lives >= 10;
      const card=document.createElement('div');
      card.className='upgrade-card';

      const h=document.createElement('h3');
      h.textContent=`Extra Life  ${lives}/10`;

      const p=document.createElement('p');
      p.textContent='Repair one lost life. Your ship can never hold more than 10 lives.';

      const c=document.createElement('p');
      c.className='cost';
      c.textContent=maxed?'LIVES FULL':`COST: ${lifeCost} PTS`;

      const b=document.createElement('button');
      b.type='button';
      b.textContent=maxed?'MAX LIVES':'BUY +1 LIFE';
      b.disabled=maxed||score<lifeCost;
      b.addEventListener('click',()=>{
        if(lives>=10||score<lifeCost) return;
        score-=lifeCost;
        lives=Math.min(10,lives+1);
        hud();
        renderUpgrades();
      });

      card.append(h,makeProgress(lives,10,true),p,c,b);
      ui.upgradeChoices.appendChild(card);
    }

    for(const def of upgradeDefs){
      const lvl=upgrades[def.key];
      const maxed=lvl>=def.max;
      const cost=upgradeCost(def);

      const card=document.createElement('div');
      card.className='upgrade-card';

      const h=document.createElement('h3');
      h.textContent=`${def.name}  LV ${lvl}/${def.max}`;

      const p=document.createElement('p');
      p.textContent=def.desc;

      const c=document.createElement('p');
      c.className='cost';
      c.textContent=maxed?'MAXED':`COST: ${cost} PTS`;

      const b=document.createElement('button');
      b.type='button';
      b.textContent=maxed?'MAXED OUT':'BUY UPGRADE';
      b.disabled=maxed||score<cost;

      b.addEventListener('click',()=>{
        const liveCost=upgradeCost(def);
        if(upgrades[def.key]>=def.max||score<liveCost) return;
        score-=liveCost;
        upgrades[def.key]++;
        hud();
        renderUpgrades();
      });

      card.append(h,makeProgress(lvl,def.max,false),p,c,b);
      ui.upgradeChoices.appendChild(card);
    }
  }

  function continueAfterUpgrade() {
    if(shopping) wave();
  }

  function update(dt) {
    if(!playing||paused||shopping) return;

    fireCooldown=Math.max(0,fireCooldown-dt);
    player.invuln=Math.max(0,player.invuln-dt);
    flash=Math.max(0,flash-dt);

    if(keys.has('ArrowLeft')||keys.has('KeyA')) player.x-=player.speed*dt;
    if(keys.has('ArrowRight')||keys.has('KeyD')) player.x+=player.speed*dt;
    player.x=Math.max(30,Math.min(W-30,player.x));

    for(const s of shots){
      s.y+=s.vy*dt;
      s.x+=(s.vx||0)*dt;
    }
    for(const s of enemyShots) s.y+=s.vy*dt;

    for(let n=shots.length-1;n>=0;n--){
      const shot=shots[n];
      let used=shot.y<-20||shot.x<-30||shot.x>W+30;

      if(bonus&&!used&&overlap(shot,bonus)){
        score+=1000;
        burst(bonus.x,bonus.y,'#ffd966',28);
        bonus=null;
        if(shot.pierce>0) shot.pierce--;
        else used=true;
        hud();
      }

      if(!used){
        for(const i of invaders) if(i.alive&&overlap(shot,i)){
          i.hp-=shot.damage;
          burst(shot.x,shot.y,i.color,6);

          if(i.hp<=0){
            i.alive=false;
            score+=i.points;
            burst(i.x,i.y,i.color,i.kind==='brute'?20:12);
            hud();
          }

          if(shot.pierce>0) shot.pierce--;
          else used=true;
          break;
        }
      }

      if(used) shots.splice(n,1);
    }

    for(let n=enemyShots.length-1;n>=0;n--){
      const s=enemyShots[n];
      if(overlap(s,player)){
        enemyShots.splice(n,1);
        hitPlayer();
      } else if(s.y>H+30){
        enemyShots.splice(n,1);
      }
    }

    const alive=invaders.filter(i=>i.alive);

    if(alive.length){
      let minX=Infinity,maxX=-Infinity;

      for(const i of alive){
        i.x+=direction*enemySpeed*dt;
        minX=Math.min(minX,i.x-i.w/2);
        maxX=Math.max(maxX,i.x+i.w/2);
      }

      if((direction>0&&maxX>W-24)||(direction<0&&minX<24)){
        direction*=-1;
        for(const i of alive) i.y+=18;
      }

      if(alive.some(i=>i.y+i.h/2>=player.y-12)){
        lives=0;
        hud();
        gameOver();
      }
    } else if(invaders.length){
      invaders.length=0;
      openUpgradeBay();
    }

    enemyFire-=dt;
    if(enemyFire<=0){
      const s=shooter();
      if(s) enemyShots.push({
        x:s.x,y:s.y+s.h/2,w:5,h:14,vy:195+level*16
      });
      enemyFire=Math.max(.25,1.05-level*.07)*(.65+Math.random()*.7);
    }

    bonusTimer-=dt;
    if(!bonus&&bonusTimer<=0){
      const dir=Math.random()<.5?1:-1;
      bonus={
        x:dir>0?-40:W+40,y:54,w:54,h:22,
        vx:dir*(105+level*5)
      };
      bonusTimer=9+Math.random()*9;
    }

    if(bonus){
      bonus.x+=bonus.vx*dt;
      if(bonus.x<-80||bonus.x>W+80) bonus=null;
    }

    for(let n=particles.length-1;n>=0;n--){
      const p=particles[n];
      p.x+=p.vx*dt;
      p.y+=p.vy*dt;
      p.vy+=180*dt;
      p.life-=dt;
      if(p.life<=0) particles.splice(n,1);
    }
  }

  function rect(x,y,w,h,color){
    ctx.fillStyle=color;
    ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));
  }

  function drawPlayer(){
    if(player.invuln>0&&Math.floor(player.invuln*12)%2===0) return;

    const x=Math.round(player.x),y=Math.round(player.y);
    rect(x-20,y+4,40,8,'#d9f7ff');
    rect(x-14,y-4,28,9,'#d9f7ff');
    rect(x-5,y-13,10,10,'#72f2cf');
    rect(x-2,y-19,4,7,'#72f2cf');

    if(upgrades.spread>0){
      rect(x-27,y+2,6,10,'#ffd966');
      rect(x+21,y+2,6,10,'#ffd966');
    }

    if(upgrades.power>1){
      rect(x-9,y-9,18,4,'#ff7edb');
    }
  }

  function drawInvader(i,t){
    const u=Math.max(2,Math.round(i.w/12));
    const x0=Math.round(i.x-u*6);
    const y0=Math.round(i.y-u*4);
    const bob=Math.floor(t*3+i.row+i.col)%2;

    const A=[
      '00100100100','00011111000','01111111110','11101110111',
      '11111111111','00110001100','01101110110',
      bob?'11010001011':'00110001100'
    ];
    const B=[
      '00011011000','00111111100','01110101110','11111111111',
      '10111111101','10100000101','00011011000',
      bob?'01100000110':'00011011000'
    ];

    const pattern=i.kind==='brute'?B:A;
    ctx.fillStyle=i.color;

    pattern.forEach((row,r)=>{
      [...row].forEach((v,c)=>{
        if(v==='1') ctx.fillRect(x0+c*u,y0+r*u,u,u);
      });
    });

    if(i.hp<i.maxHp){
      rect(i.x-10,i.y+i.h/2+4,20*(i.hp/i.maxHp),2,'#fff');
    }
  }

  function draw(t){
    ctx.fillStyle='#000';
    ctx.fillRect(0,0,W,H);

    for(const s of stars){
      ctx.globalAlpha=s.a*(.75+.25*Math.sin(t*1.4+s.x));
      rect(s.x,s.y,s.s,s.s,'#fff');
    }
    ctx.globalAlpha=1;

    ctx.strokeStyle='#1a3a38';
    ctx.lineWidth=2;
    ctx.setLineDash([8,8]);
    ctx.beginPath();
    ctx.moveTo(0,H-28);
    ctx.lineTo(W,H-28);
    ctx.stroke();
    ctx.setLineDash([]);

    for(const i of invaders) if(i.alive) drawInvader(i,t);

    if(bonus){
      const x=Math.round(bonus.x),y=Math.round(bonus.y);
      rect(x-24,y,48,7,'#ffd966');
      rect(x-17,y-7,34,7,'#ff9d5c');
      rect(x-8,y-12,16,5,'#fff');
      rect(x-18,y+7,7,5,'#ff7edb');
      rect(x+11,y+7,7,5,'#ff7edb');
    }

    for(const s of shots){
      rect(s.x-s.w/2,s.y-s.h/2,s.w,s.h,upgrades.power>0?'#7fffd4':'#d9fff7');
    }

    for(const s of enemyShots){
      rect(s.x-s.w/2,s.y-s.h/2,s.w,s.h,'#ff6f91');
      rect(s.x-1,s.y-5,2,4,'#fff');
    }

    drawPlayer();

    for(const p of particles){
      ctx.globalAlpha=Math.min(1,p.life*2.5);
      rect(p.x,p.y,p.size,p.size,p.color);
    }
    ctx.globalAlpha=1;

    if(paused&&playing&&!shopping){
      ctx.fillStyle='rgba(0,0,0,.55)';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#fff';
      ctx.textAlign='center';
      ctx.font='bold 44px monospace';
      ctx.fillText('PAUSED',W/2,H/2);
    }

    if(flash>0){
      ctx.fillStyle=`rgba(255,255,255,${flash*1.8})`;
      ctx.fillRect(0,0,W,H);
    }
  }

  function loop(now){
    const dt=Math.min(.034,(now-last)/1000||0);
    last=now;
    update(dt);
    draw(now/1000);
    requestAnimationFrame(loop);
  }

  function loadScores(){
    try{
      return JSON.parse(
        localStorage.getItem('pixel-invaders-scores') ||
        localStorage.getItem('pixel-patrol-scores') ||
        '[]'
      );
    }catch{
      return [];
    }
  }

  function renderScores(){
    const scores=loadScores().sort((a,b)=>b.score-a.score).slice(0,8);
    ui.board.innerHTML='';

    if(!scores.length){
      const li=document.createElement('li');
      li.textContent='NO SCORES YET';
      ui.board.appendChild(li);
      return;
    }

    for(const e of scores){
      const li=document.createElement('li');
      const span=document.createElement('span');
      li.append(document.createTextNode(e.initials));
      span.textContent=e.score;
      li.appendChild(span);
      ui.board.appendChild(li);
    }
  }

  function saveScore(){
    const initials=ui.initials.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g,'')
      .slice(0,3) || '???';

    const scores=loadScores();
    scores.push({initials,score:Math.floor(score),at:Date.now()});
    scores.sort((a,b)=>b.score-a.score);

    localStorage.setItem(
      'pixel-invaders-scores',
      JSON.stringify(scores.slice(0,20))
    );

    renderScores();
    ui.saveBtn.textContent='SAVED!';
    setTimeout(()=>ui.saveBtn.textContent='SAVE SCORE',900);
  }

  async function toggleFullscreen(){
    try{
      if(!document.fullscreenElement){
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    }catch{
      document.body.classList.toggle('fullscreen-mode');
    }
  }

  function syncFullscreen(){
    const full=!!document.fullscreenElement;
    document.body.classList.toggle('fullscreen-mode',full);
    ui.fullscreenBtn.textContent=full?'EXIT FULL SCREEN':'FULL SCREEN';
  }

  addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();

    keys.add(e.code);

    if(e.code==='Space') fire();
    if(e.code==='KeyP'&&playing&&!shopping) paused=!paused;
    if(e.code==='KeyR') start();
    if(e.code==='KeyF') toggleFullscreen();
  },{passive:false});

  addEventListener('keyup',e=>keys.delete(e.code));
  document.addEventListener('fullscreenchange',syncFullscreen);

  const touchPointers = { left:new Set(), right:new Set(), fire:new Set() };

  function bindHoldButton(button, bucket, keyCode, onPress) {
    if(!button) return;
    const release = e => {
      bucket.delete(e.pointerId);
      if(bucket.size===0){
        if(keyCode) keys.delete(keyCode);
        button.classList.remove('active');
      }
    };
    button.addEventListener('pointerdown', e => {
      e.preventDefault();
      bucket.add(e.pointerId);
      try { button.setPointerCapture(e.pointerId); } catch {}
      if(keyCode) keys.add(keyCode);
      button.classList.add('active');
      if(onPress) onPress();
    }, {passive:false});
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  }

  bindHoldButton(ui.touchLeft, touchPointers.left, 'ArrowLeft');
  bindHoldButton(ui.touchRight, touchPointers.right, 'ArrowRight');
  bindHoldButton(ui.touchFire, touchPointers.fire, null, fire);

  // Holding FIRE repeatedly shoots at the ship's current fire-rate while a direction
  // can remain held by a different finger/pointer at the same time.
  setInterval(() => {
    if(touchPointers.fire.size>0) fire();
  }, 25);

  ui.startBtn.addEventListener('click',start);
  ui.againBtn.addEventListener('click',start);
  ui.saveBtn.addEventListener('click',saveScore);
  ui.continueBtn.addEventListener('click',continueAfterUpgrade);
  ui.fullscreenBtn.addEventListener('click',toggleFullscreen);

  ui.initials.addEventListener('input',()=>{
    ui.initials.value=ui.initials.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g,'')
      .slice(0,3);
  });

  makeStars();
  renderScores();
  hud();
  requestAnimationFrame(loop);
})();
