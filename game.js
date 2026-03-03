// ================================================================
// FRONTIER — game.js
//
// CHANGES vs previous version:
//  - Opportunity cards show description in hand
//  - Fixed 2-turns-per-round bug (no duplicate event listeners / spendAction)
//  - Disabled buttons are truly grey/invisible
//  - Global Catastrophe shows on game over screen
//  - Negotiate gives +2 Funding (was +1)
//  - Moon landing prompt when passing space 5
//  - Mars landing prompt when passing space 8
//  - Board is a clearer numbered route (space numbers + connector lines)
//  - Move Back action (1 space, no cost)
//  - Breakdown cards renamed "Mental Breakdown"
//  - Mutiny cards removed
//  - Event card fires once per round at round START (before player 0's turn)
//  - Rules side panel added
//  - Win screen shows proper congratulations detail
// ================================================================

// ================================================================
// 1. FACTIONS
// ================================================================
const FACTIONS = {
  nasa: {
    id:'nasa', name:'NASA', fullName:'NASA / United States',
    color:'#3a7aff', fundingPerTurn:2, moveSpeed:1,
    policyProtection:'strong',
    ability:'POLICY PROTECTION – STRONG: Once per round, reduce a negative Policy effect by half or ignore one penalty entirely.',
    startFunding:10
  },
  cnsa: {
    id:'cnsa', name:'CNSA', fullName:'China National Space Administration',
    color:'#ff4444', fundingPerTurn:2, moveSpeed:2,
    policyProtection:'medium',
    ability:'POLICY PROTECTION – MEDIUM: Once per round, delay one Policy Card effect by 1 turn.',
    startFunding:8
  },
  esa: {
    id:'esa', name:'ESA', fullName:'European Space Agency',
    color:'#f5c623', fundingPerTurn:1, moveSpeed:1,
    policyProtection:'very_strong',
    ability:'POLICY PROTECTION – VERY STRONG: Policy Cards have no effect on ESA.',
    startFunding:8
  },
  private: {
    id:'private', name:'PRIVATE CORP', fullName:'Private Corporation',
    color:'#a855f7', fundingPerTurn:3, moveSpeed:3,
    policyProtection:'weak',
    ability:'POLICY PROTECTION – WEAK: No protection. Must pay +1 Funding to resist any Policy effect.',
    startFunding:12
  }
};

// ================================================================
// 2. BOARD SPACES + VISUAL LAYOUT
// 12 spaces: 0 (Earth) → 11 (Deep Space)
// ================================================================
const BOARD_SPACES = [
  {
    position:0, name:'Earth', shortName:'EARTH', type:'start', color:'#30e890',
    colonyPoints:0, description:'Mission origin. Full crew health.',
    onLand(p){ addLog(`${p.name} is on Earth — mission HQ.`,'system'); }
  },
  {
    position:1, name:'Launch Window', shortName:'LAUNCH', type:'safe', color:'#00ddbb',
    colonyPoints:0, description:'Final checks. Gain +1 Funding.',
    onLand(p){ p.funding++; addLog(`${p.name}: launch prep. +1 Funding.`,'action'); }
  },
  {
    position:2, name:'Low Earth Orbit', shortName:'L.E.O.', type:'hazard', color:'#4aacff',
    colonyPoints:0, description:'Microgravity begins. All crew –1 Sleep.',
    onLand(p){ p.crew.forEach(c=>c.adjustStat('sleep',-1)); addLog(`${p.name}: entered LEO — circadian disruption.`,'event'); }
  },
  {
    position:3, name:'I.S.S.', shortName:'I.S.S.', type:'safe', color:'#4aacff',
    colonyPoints:2, description:'ISS resupply. Deploy for 2 Colony Points.',
    onLand(p){ addLog(`${p.name}: docked at I.S.S.`,'system'); }
  },
  {
    position:4, name:'Lunar Transit', shortName:'L.TRANSIT', type:'event', color:'#8888bb',
    colonyPoints:0, description:'Open space between Earth and Moon. Event Card on arrival.',
    onLand(p){ addLog(`${p.name}: lunar transit — event incoming.`,'event'); triggerEventCard(); }
  },
  {
    position:5, name:'The Moon', shortName:'MOON', type:'colony', color:'#c8c0b0',
    colonyPoints:5, description:'Colony site (5 pts). Policy Shield when colonized.',
    onLand(p){ addLog(`${p.name}: reached the Moon (5 pts).`,'system'); }
  },
  {
    position:6, name:'Inner Belt', shortName:'INNER BELT', type:'hazard', color:'#c89050',
    colonyPoints:0, description:'Inner asteroid belt. All crew +1 Radiation.',
    onLand(p){ p.crew.forEach(c=>c.adjustStat('radiation',1)); addLog(`${p.name}: inner belt — +1 Radiation.`,'event'); }
  },
  {
    position:7, name:'Asteroid Belt', shortName:'AST.BELT', type:'hazard', color:'#e8a840',
    colonyPoints:0, description:'Dense debris field. All crew +1 Radiation. –1 Morale.',
    onLand(p){
      p.crew.forEach(c=>{ c.adjustStat('radiation',1); c.adjustStat('morale',-1); });
      addLog(`${p.name}: asteroid belt — +1 Rad, –1 Morale.`,'event');
    }
  },
  {
    position:8, name:'Outer Belt', shortName:'OUTER BELT', type:'safe', color:'#d07828',
    colonyPoints:0, description:'Clearing beyond the belt. Draw an Opportunity Card for free.',
    onLand(p){
      if(GAME.opportunityDeck.length===0) GAME.opportunityDeck=shuffle(OPPORTUNITY_CARDS);
      const card=GAME.opportunityDeck.pop(); p.hand.push(card);
      addLog(`${p.name}: cleared the belt — free Opportunity Card: "${card.name}".`,'action');
    }
  },
  {
    position:9, name:'Mars Approach', shortName:'MARS APP.', type:'event', color:'#e06030',
    colonyPoints:0, description:'Solar radiation spikes on approach. Event Card on arrival.',
    onLand(p){ addLog(`${p.name}: Mars approach — event incoming.`,'event'); triggerEventCard(); }
  },
  {
    position:10, name:'Mars', shortName:'MARS', type:'colony', color:'#e06030',
    colonyPoints:12, description:'Primary colony (12 pts). +1 Radiation, –1 Morale on arrival.',
    onLand(p){
      p.crew.forEach(c=>{ c.adjustStat('radiation',1); c.adjustStat('morale',-1); });
      addLog(`${p.name}: landed on Mars.`,'event');
    }
  },
  {
    position:11, name:'Deep Space', shortName:'VOID', type:'colony', color:'#b060ff',
    colonyPoints:20, description:'Maximum hazard. Maximum reward (20 pts).',
    onLand(p){
      p.crew.forEach(c=>{ c.adjustStat('radiation',2); c.adjustStat('morale',-2); c.adjustStat('sleep',-1); });
      addLog(`${p.name}: entered Deep Space — all systems under stress.`,'event');
    }
  }
];
const BOARD_LENGTH = BOARD_SPACES.length;

// Visual layout — planets ARE the board nodes.
// Main route runs left→right across the canvas.
// Moon branches upward from space 4.
// Asteroid belt (spaces 6,7,8) sits in the center with a visible debris cloud behind it.
const SPACE_LAYOUT = [
  { xf:0.045, yf:0.68, landmark:true,  planet:'earth'     },  // 0  Earth
  { xf:0.130, yf:0.68, landmark:false, planet:null        },  // 1  Launch Window
  { xf:0.200, yf:0.68, landmark:false, planet:null        },  // 2  LEO
  { xf:0.275, yf:0.68, landmark:true,  planet:'iss'       },  // 3  ISS
  { xf:0.340, yf:0.55, landmark:false, planet:null        },  // 4  Lunar Transit (junction)
  { xf:0.340, yf:0.18, landmark:true,  planet:'moon'      },  // 5  Moon (top branch)
  { xf:0.440, yf:0.68, landmark:false, planet:null        },  // 6  Inner Belt
  { xf:0.535, yf:0.68, landmark:false, planet:null        },  // 7  Asteroid Belt
  { xf:0.620, yf:0.68, landmark:false, planet:null        },  // 8  Outer Belt
  { xf:0.700, yf:0.68, landmark:false, planet:null        },  // 9  Mars Approach
  { xf:0.790, yf:0.68, landmark:true,  planet:'mars'      },  // 10 Mars
  { xf:0.940, yf:0.50, landmark:true,  planet:'deepspace' },  // 11 Deep Space
];
// ================================================================
// 3. CARD DECKS
// ================================================================

// --- No more MUTINY_CARDS ---

const EVENT_CARDS = [
  {
    name:'Solar Particle Event',
    text:'All crews beyond Orbit take +2 Radiation. Each gains a Reproduction Risk token.',
    effect(p){
      GAME.players.forEach(pl=>{
        if(pl.position>2){ pl.crew.forEach(c=>c.adjustStat('radiation',2)); pl.reproRiskTokens++; addLog(`${pl.name}: +2 Rad, +1 Repro Risk.`,'event'); }
      });
    }
  },
  {
    name:'Crew Conflict',
    text:'The crew member with lowest Morale loses 1 more Morale and skips their next action.',
    effect(p){
      const w=[...p.crew].sort((a,b)=>a.morale-b.morale)[0];
      w.adjustStat('morale',-1); w.skipNextAction=true;
      addLog(`${p.name}: ${w.role} –1 Morale, skips next action.`,'event');
    }
  },
  {
    name:'Circadian Disruption',
    text:'All crews lose 1 Sleep.',
    effect(p){ GAME.players.forEach(pl=>{ pl.crew.forEach(c=>c.adjustStat('sleep',-1)); addLog(`💤 ${pl.name}: –1 Sleep.`,'event'); }); }
  },
  {
    name:'Comms Delay',
    text:'This faction\'s next Move action resolves 2 turns later and cannot be changed.',
    effect(p){ p.commsDelay=2; addLog(`${p.name}: Comms Delay active.`,'event'); }
  },
  {
    name:'Microgravity Syndrome',
    text:'Move actions cost +1 Funding this turn.',
    effect(p){ p.moveCostModifier+=1; addLog(`${p.name}: Move +1 Funding cost.`,'event'); }
  },
  {
    name:'Micrometeor Storm',
    text:'If beyond the Moon: lose 1 Funding or a random crew member takes +1 Radiation.',
    effect(p){
      if(p.position>5){
        if(p.funding>0){ p.funding--; addLog(`${p.name}: –1 Funding (storm).`,'event'); }
        else{ const t=p.crew[Math.floor(Math.random()*p.crew.length)]; t.adjustStat('radiation',1); addLog(`${p.name}: ${t.role} +1 Rad.`,'event'); }
      }
    }
  },
  {
    name:'AI Navigation Failure',
    text:'One action slot is locked for all factions this turn.',
    effect(p){ GAME.players.forEach(pl=>{ pl.navBlocked=true; addLog(`${pl.name}: nav failure.`,'event'); }); }
  },
  {
    name:'Crew Homesickness',
    text:'All crews beyond Mars lose 2 Morale.',
    effect(p){ GAME.players.forEach(pl=>{ if(pl.position>8){ pl.crew.forEach(c=>c.adjustStat('morale',-2)); addLog(`${pl.name}: homesickness –2 Morale.`,'event'); } }); }
  },
  {
    name:'Life Support Leak',
    text:'If in Deep Space: the crew member with lowest Sleep loses 2 Sleep.',
    effect(p){
      if(p.position>=9){
        const w=[...p.crew].sort((a,b)=>a.sleep-b.sleep)[0];
        w.adjustStat('sleep',-2); addLog(`⚠ ${p.name}: ${w.role} –2 Sleep (leak).`,'event');
      }
    }
  },
  {
    name:'Signal Corruption',
    text:'All factions with an active Comms Delay have it extended by +1 turn.',
    effect(p){ GAME.players.forEach(pl=>{ if(pl.commsDelay>0){ pl.commsDelay++; addLog(`${pl.name}: Comms Delay extended.`,'event'); } }); }
  },
  {
    name:'⚡ GLOBAL CATASTROPHE — Solar Superflare',
    text:'All crews beyond Mars take +3 Radiation. If NO faction holds any Opportunity Cards, EVERYONE LOSES immediately.',
    isGlobalCatastrophe:true,
    effect(p){
      GAME.players.forEach(pl=>{ if(pl.position>8){ pl.crew.forEach(c=>c.adjustStat('radiation',3)); addLog(`⚡ ${pl.name}: +3 Rad (Superflare!).`,'event'); } });
      if(!GAME.players.some(pl=>pl.hand.length>0)){
        endGame(
          'Global Catastrophe: Solar Superflare erupted while no faction held Opportunity Cards.',
          'loss', null,
          'With no shielding technology in hand, all missions were lost to the flare. The void claims another generation of explorers.'
        );
      }
    }
  }
];

const POLICY_CARDS = [
  {
    name:'International Treaty',
    text:'No faction may advance past the Moon this round. Private Corp loses 1 Funding if they refuse.',
    effect(){
      GAME.players.forEach(p=>{
        if(p.position<5) p.moveCap=5;
        if(p.faction.id==='private'){ p.funding=Math.max(0,p.funding-1); addLog(`⚖ ${p.name}: –1 Funding (Treaty).`,'event'); }
      });
      addLog('⚖ POLICY: International Treaty.','warn');
    }
  },
  {
    name:'Deregulation Push',
    text:'Private Corp gains +2 Speed tokens this round.',
    effect(){
      GAME.players.forEach(p=>{ if(p.faction.id==='private'){ p.speedBonus+=2; addLog(`⚖ ${p.name}: +2 Speed.`,'action'); } });
      addLog('⚖ POLICY: Deregulation Push.','warn');
    }
  },
  {
    name:'Environmental Audit',
    text:'Each faction discards 1 Funding or takes a Sanctions marker (–2 Funding next round).',
    effect(){
      GAME.players.forEach(p=>{
        if(p.faction.policyProtection==='very_strong'){ addLog(`⚖ ${p.name} (ESA): immune.`,'system'); return; }
        if(p.funding>0){ p.funding--; addLog(`⚖ ${p.name}: –1 Funding (Audit).`,'event'); }
        else{ p.sanctioned=true; addLog(`⚖ ${p.name}: Sanctioned.`,'warn'); }
      });
      addLog('⚖ POLICY: Environmental Audit.','warn');
    }
  },
  {
    name:'Emergency Accord',
    text:'No one advances this round. All Radiation drops by 1.',
    effect(){
      GAME.players.forEach(p=>{ p.moveCap=p.position; p.crew.forEach(c=>c.adjustStat('radiation',-1)); addLog(`⚖ ${p.name}: frozen, –1 Rad.`,'action'); });
      addLog('⚖ POLICY: Emergency Accord.','warn');
    }
  },
  {
    name:'Resource Nationalization',
    text:'All factions lose 1 Funding. ESA gains +1 Colony Point instead.',
    effect(){
      GAME.players.forEach(p=>{
        if(p.faction.policyProtection==='very_strong'){ p.colonyPoints++; addLog(`⚖ ${p.name} (ESA): +1 pt.`,'action'); }
        else{ p.funding=Math.max(0,p.funding-1); addLog(`⚖ ${p.name}: –1 Funding.`,'event'); }
      });
      addLog('⚖ POLICY: Resource Nationalization.','warn');
    }
  },
  {
    name:'Scientific Consortium',
    text:'The next Opportunity Card played affects ALL factions.',
    effect(){ GAME.consortiumActive=true; addLog('⚖ POLICY: Scientific Consortium.','warn'); }
  },
  {
    name:'Orbital Tariffs',
    text:'Moving costs +1 Funding for all factions this round.',
    effect(){ GAME.players.forEach(p=>p.moveCostModifier++); addLog('⚖ POLICY: Orbital Tariffs.','warn'); }
  },
  {
    name:'Emergency Militarization',
    text:'The next Event Card drawn is doubled in effect.',
    effect(){ GAME.doubleNextEvent=true; addLog('⚖ POLICY: Emergency Militarization.','warn'); }
  },
  {
    name:'Corporate Liability Act',
    text:'Private Corp loses 2 Funding. All public agencies gain +1 Funding.',
    effect(){
      GAME.players.forEach(p=>{
        if(p.faction.id==='private'){ p.funding=Math.max(0,p.funding-2); addLog(`⚖ ${p.name}: –2 Funding.`,'event'); }
        else{ p.funding++; addLog(`⚖ ${p.name}: +1 Funding.`,'action'); }
      });
      addLog('⚖ POLICY: Corporate Liability Act.','warn');
    }
  }
];

const OPPORTUNITY_CARDS = [
  { name:'Radiation Shielding v2',
    text:'Reduce all crew Radiation by 2. Play at any time.',
    effect(p){ p.crew.forEach(c=>c.adjustStat('radiation',-2)); addLog(`✦ ${p.name}: Rad Shielding — all –2 Rad.`,'action'); } },
  { name:'Psych Specialist',
    text:'Restore 2 Morale to your lowest-morale crew member. Immune to Crew Conflict this round.',
    effect(p){ const w=[...p.crew].sort((a,b)=>a.morale-b.morale)[0]; w.adjustStat('morale',2); p.immuneToConflict=true; addLog(`✦ ${p.name}: Psych Specialist — ${w.role} +2 Morale.`,'action'); } },
  { name:'Fast Burn Thruster',
    text:'Your next Move action this turn is free (no Funding cost).',
    effect(p){ p.freeMove=true; addLog(`✦ ${p.name}: Fast Burn — free move.`,'action'); } },
  { name:'Cryo-Sleep Module',
    text:'Skip the next Event Card that would affect you. Fully restore all crew Sleep to 5.',
    effect(p){ p.skipNextEvent=true; p.crew.forEach(c=>c.sleep=5); addLog(`✦ ${p.name}: Cryo-Sleep — event skipped, full Sleep.`,'action'); } },
  { name:'Research Breakthrough',
    text:'Remove 1 Reproduction Risk token. Gain 2 Colony Points.',
    effect(p){ p.reproRiskTokens=Math.max(0,p.reproRiskTokens-1); p.colonyPoints+=2; addLog(`✦ ${p.name}: Research Breakthrough — –1 Risk, +2 pts.`,'action'); } },
  { name:'Radiation Flush Protocol',
    text:'Fully clear Radiation from your most irradiated crew member. Adds +1 Repro Risk token (medical side effect).',
    effect(p){ const w=[...p.crew].sort((a,b)=>b.radiation-a.radiation)[0]; w.radiation=0; p.reproRiskTokens++; addLog(`✦ ${p.name}: Rad Flush — ${w.role} cleared.`,'action'); } },
  { name:'VR Recreation Suite',
    text:'All crew gain +2 Morale. Morale is capped at 5.',
    effect(p){ p.crew.forEach(c=>c.adjustStat('morale',2)); addLog(`✦ ${p.name}: VR Suite — all +2 Morale.`,'action'); } },
  { name:'Stimulant Cycle',
    text:'Ignore Crew Sleep Decay this turn. Side effect: Commander gains +1 Radiation.',
    effect(p){ p.ignoreDecayThisTurn=true; p.crew[0].adjustStat('radiation',1); addLog(`✦ ${p.name}: Stimulants — decay ignored, Cmd +1 Rad.`,'action'); } },
  { name:'Emergency Rations',
    text:'Completely prevent all Crew Decay this turn (Sleep and Morale).',
    effect(p){ p.ignoreDecayThisTurn=true; addLog(`✦ ${p.name}: Emergency Rations — decay prevented.`,'action'); } },
  { name:'Black Budget',
    text:'Gain 3 Funding immediately. Immediately draw a Policy Card (may affect everyone).',
    effect(p){ p.funding+=3; addLog(`✦ ${p.name}: Black Budget — +3 Funding.`,'action'); triggerPolicyCard(); } },
  { name:'Orbital Slingshot Window',
    text:'Move 2 extra spaces for free. Immediately after, an Event Card is drawn for you.',
    effect(p){ p.slingshotMove=2; addLog(`✦ ${p.name}: Slingshot — 2 free spaces, then Event.`,'action'); } }
];

// --- MENTAL BREAKDOWN CARDS (renamed from "Breakdown") ---
const BREAKDOWN_CARDS = [
  { name:'Panic Attack',             text:'This crew member loses 1 Sleep.',
    effect(p,c){ c.adjustStat('sleep',-1); } },
  { name:'Emotional Shutdown',       text:'Lose 1 Action this turn.',
    effect(p,c){ p.actionsRemaining=Math.max(0,p.actionsRemaining-1); } },
  { name:'Reckless Decision-Making', text:'Your next Action costs +1 Funding.',
    effect(p,c){ p.actionCostMod=(p.actionCostMod||0)+1; } },
  { name:'Conflict With Teammate',   text:'A random other crew member loses 1 Morale.',
    effect(p,c){ const o=p.crew.filter(x=>x!==c); if(o.length) o[Math.floor(Math.random()*o.length)].adjustStat('morale',-1); } },
  { name:'Tunnel Vision',            text:'Cannot Move this turn.',
    effect(p,c){ p.moveBlocked=true; } },
  { name:'Insomnia Spiral',          text:'All crew lose 1 Sleep.',
    effect(p,c){ p.crew.forEach(x=>x.adjustStat('sleep',-1)); } },
  { name:'Loss of Confidence',       text:'Role penalties apply even if stats are above 1 this turn.',
    effect(p,c){ c.rolePenaltyForced=true; } },
  { name:'Frozen Under Pressure',    text:'Skip one Action this turn.',
    effect(p,c){ p.actionsRemaining=Math.max(0,p.actionsRemaining-1); } },
  { name:'Crew Tension',             text:'Cannot Negotiate this turn.',
    effect(p,c){ p.canNegotiate=false; } },
  { name:'Psychosomatic Illness',    text:'This crew member gains +1 Radiation.',
    effect(p,c){ c.adjustStat('radiation',1); } },
  { name:'Spiral of Errors',         text:'The next Event Card that affects you is doubled.',
    effect(p,c){ p.doubleNextEvent=true; } },
  { name:'Isolation',                text:'Opportunity Cards cannot be used on this crew member this turn.',
    effect(p,c){ c.immuneToOpportunity=true; } }
];

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

// ================================================================
// 4. GAME STATE
// ================================================================
const GAME = {
  players:[], currentPlayerIndex:0, turn:1, round:1,
  eventDeck:[], policyDeck:[], opportunityDeck:[], breakdownDeck:[],
  consortiumActive:false, doubleNextEvent:false, isOver:false, lastReachedPosition:0,
  roundEventFired:false, // tracks whether the round-start event has fired this round
  get currentPlayer(){ return this.players[this.currentPlayerIndex]; }
};

// ================================================================
// 5. PLAYER CLASS
// ================================================================
class Player {
  constructor(name, factionId, index){
    this.name=name; this.faction=FACTIONS[factionId]; this.index=index;
    this.position=0; this.funding=this.faction.startFunding;
    this.colonyPoints=0; this.reproRiskTokens=0; this.hand=[];
    this.infraTurns=0; this.colonized=[]; this.hasMoonShield=false; this.restStreak=0;
    this.actionsRemaining=2; this.moveCostModifier=0; this.moveCap=99;
    this.speedBonus=0; this.moveSpeedPenalty=0; this.commsDelay=0;
    this.skipNextEvent=false; this.freeMove=false; this.slingshotMove=0;
    this.moveBlocked=false; this.ignoreDecayThisTurn=false; this.navBlocked=false;
    this.forcedRest=false; this.locked=false; this.actionCostMod=0;
    this.bonusPenaltyActions=0; this.immuneToConflict=false; this.sanctioned=false;
    this.canNegotiate=true; this.doubleNextEvent=false;
    this.crew=[new Crew('Commander',this), new Crew('Engineer',this), new Crew('Medic',this)];
  }

move(spaces){
    if(this.moveBlocked){ addLog(`${this.name}: cannot Move (blocked).`,'warn'); return false; }
    const speed=this.faction.moveSpeed+this.speedBonus-(this.moveSpeedPenalty||0);
    const finalSpaces=Math.max(1,spaces*speed);
    const cost=Math.max(0,finalSpaces+this.moveCostModifier);
    if(!this.freeMove && this.funding<cost){ addLog(`${this.name}: needs ${cost} Funding.`,'warn'); return false; }
    if(!this.freeMove) this.funding-=cost; else this.freeMove=false;

    const rawNewPos=Math.min(Math.min(BOARD_LENGTH-1,this.moveCap),this.position+finalSpaces);

    // Check if passing Moon (5) without stopping — prompt to land
    if(this.position<5 && rawNewPos>5){
      pendingMove={player:this, destination:rawNewPos};
      showLandingPrompt('moon');
      return 'pending';
    }
    // Check if passing Mars (10) without stopping — prompt to land
    if(this.position<10 && rawNewPos>10){
      pendingMove={player:this, destination:rawNewPos};
      showLandingPrompt('mars');
      return 'pending';
    }

    return this._completeMove(rawNewPos);
  }

  _completeMove(newPos){
    if(newPos!==this.position) this.infraTurns=0;
    this.position=newPos;
    this.moveCostModifier=0;
    addLog(`${this.name}: moved to ${BOARD_SPACES[newPos].name}.`,'action');
    BOARD_SPACES[newPos].onLand(this);
    if(newPos>GAME.lastReachedPosition){
      GAME.lastReachedPosition=newPos;
      if(newPos>0){ addLog('New location — Policy Card.','warn'); triggerPolicyCard(); }
    }
    updateUI();
    return true;
  }

  moveBack(){
    if(this.position<=0){ addLog(`${this.name}: already at Earth.`,'warn'); return false; }
    const newPos=this.position-1;
    this.position=newPos;
    this.infraTurns=0;
    addLog(`${this.name}: moved back to ${BOARD_SPACES[newPos].name}.`,'action');
    updateUI();
    return true;
  }

  rest(){
    this.restStreak++;
    this.crew.forEach(c=>c.adjustStat('sleep',2));
    addLog(`${this.name}: rested — all crew +2 Sleep.`,'action');
    if(this.restStreak>=2){
      if(this.funding>=1){ this.funding--; const w=[...this.crew].sort((a,b)=>a.morale-b.morale)[0]; w.adjustStat('morale',1); addLog(`${this.name}: rest streak — ${w.role} +1 Morale.`,'action'); }
      else if(this.reproRiskTokens>0){ this.reproRiskTokens--; addLog(`${this.name}: rest streak — –1 Repro Risk.`,'action'); }
    }
  }

  buyOpportunity(){
    if(GAME.opportunityDeck.length===0) GAME.opportunityDeck=shuffle(OPPORTUNITY_CARDS);
    const card=GAME.opportunityDeck.pop(); this.hand.push(card);
    addLog(`${this.name}: bought "${card.name}".`,'action');
  }

  playOpportunity(index){
    if(index<0||index>=this.hand.length) return;
    const card=this.hand.splice(index,1)[0];
    addLog(`${this.name}: played "${card.name}".`,'action');
    if(GAME.consortiumActive){ GAME.players.forEach(p=>card.effect(p)); GAME.consortiumActive=false; addLog('Consortium: Opportunity applied to all!','warn'); }
    else card.effect(this);
    updateUI();
  }

  deploy(){
    if(this.locked){ addLog(`${this.name}: locked (cannot Deploy).`,'warn'); return false; }
    const sp=BOARD_SPACES[this.position];
    if(sp.type!=='colony'&&sp.type!=='safe'){ addLog(`${this.name}: not a valid build site.`,'warn'); return false; }
    if(this.crew.some(c=>c.morale<=0||c.sleep<=0)){ addLog(`${this.name}: crew too degraded.`,'warn'); return false; }
    this.infraTurns++;
    addLog(`${this.name}: deploying (${this.infraTurns}/3).`,'action');
    if(this.infraTurns>=3){
      const pts=Math.max(0,sp.colonyPoints-this.reproRiskTokens);
      this.colonyPoints+=pts; this.colonized.push(this.position);
      if(this.position===5) this.hasMoonShield=true;
      this.infraTurns=0;
      addLog(`${this.name}: colony established! +${pts} pts.`,'action');
      checkWinCondition();
    }
    return true;
  }

  research(){
    const maxRad=Math.max(...this.crew.map(c=>c.radiation));
    if(maxRad>=this.reproRiskTokens){ const t=this.crew.find(c=>c.radiation===maxRad); t.adjustStat('radiation',-1); addLog(`${this.name}: research — ${t.role} –1 Rad.`,'action'); }
    else{ this.reproRiskTokens=Math.max(0,this.reproRiskTokens-1); addLog(`${this.name}: research — –1 Repro Risk.`,'action'); }
  }

  negotiate(){
    if(!this.canNegotiate||this.locked){ addLog(`${this.name}: cannot Negotiate.`,'warn'); return false; }
    this.funding+=2; // +2 Funding (changed from +1)
    addLog(`${this.name}: negotiated — +2 Funding.`,'action');
    return true;
  }

  applyDecay(){
    if(this.ignoreDecayThisTurn){ this.ignoreDecayThisTurn=false; addLog(`${this.name}: Crew Decay prevented.`,'system'); return; }
    if(this.position>0){ this.crew.forEach(c=>c.adjustStat('sleep',-1)); addLog(`${this.name}: all crew –1 Sleep (decay).`,'system'); }
    if(this.position>5){ this.crew.forEach(c=>c.adjustStat('morale',-1)); addLog(`${this.name}: all crew –1 Morale (isolation).`,'system'); }
    if(this.sanctioned){ this.funding=Math.max(0,this.funding-2); this.sanctioned=false; addLog(`${this.name}: –2 Funding (sanctions).`,'event'); }
  }

  resetTurnModifiers(){
    this.actionsRemaining=2+(this.bonusPenaltyActions||0);
    this.moveCostModifier=0; this.moveCap=99; this.speedBonus=0;
    this.moveSpeedPenalty=0; this.moveBlocked=false; this.navBlocked=false;
    this.forcedRest=false; this.locked=false; this.actionCostMod=0;
    this.bonusPenaltyActions=0; this.canNegotiate=true; this.immuneToConflict=false;
    this.crew.forEach(c=>{ c.rolePenaltyForced=false; c.immuneToOpportunity=false; });
  }

  applyRolePenalties(){
    const [cmd,eng]=this.crew;
    if(cmd.sleep<=1||cmd.rolePenaltyForced){ this.actionsRemaining=Math.min(this.actionsRemaining,1); addLog(`${this.name}: Commander sleep critical — 1 Action only.`,'warn'); }
    if(cmd.morale<=1||cmd.rolePenaltyForced){ this.actionCostMod=(this.actionCostMod||0)+1; addLog(`${this.name}: Commander morale low — Actions +1 Funding.`,'warn'); }
    if(eng.sleep<=1){ this.moveCostModifier++; addLog(`${this.name}: Engineer sleep critical — Move +1 Funding.`,'warn'); }
    // Mental Breakdown on zero morale (no more Mutiny)
    this.crew.forEach(c=>{ if(c.morale===0) this.drawBreakdownCard(c); });
  }

  drawBreakdownCard(crewMember){
    if(GAME.breakdownDeck.length===0) GAME.breakdownDeck=shuffle(BREAKDOWN_CARDS);
    const card=GAME.breakdownDeck.pop();
    addLog(`💀 MENTAL BREAKDOWN — ${this.name} (${crewMember.role}): "${card.name}"`,'event');
    showCard(card,'breakdown'); card.effect(this,crewMember);
  }
}

// ================================================================
// 6. CREW CLASS
// ================================================================
class Crew {
  constructor(role,player){
    this.role=role; this.player=player;
    this.radiation=0; this.sleep=5; this.morale=5;
    this.skipNextAction=false; this.rolePenaltyForced=false; this.immuneToOpportunity=false;
  }
  adjustStat(stat,amount){
    const max={radiation:5,sleep:5,morale:5},min={radiation:0,sleep:0,morale:0};
    this[stat]=Math.min(max[stat],Math.max(min[stat],this[stat]+amount));
    if(stat==='radiation'&&this[stat]>=5&&amount>0){ this.player.reproRiskTokens++; addLog(`☢ ${this.player.name} — ${this.role} max Radiation → +1 Repro Risk.`,'warn'); }
    updateUI();
  }
  isCritical(){ return this.radiation>=5||this.sleep<=0||this.morale<=0; }
}

// ================================================================
// 7. TURN ENGINE
// Event card fires ONCE per round at the start of player 0's turn.
// ================================================================
function startRound(){
  // Fire one event card at the very start of each round (before any player acts)
  if(!GAME.roundEventFired){
    GAME.roundEventFired=true;
    addLog(`━━━━ ROUND ${GAME.round} — EVENT PHASE ━━━━`,'warn');
    triggerEventCard();
  }
}

function startTurn(){
  if(GAME.isOver) return;
  const p=GAME.currentPlayer;
  p.resetTurnModifiers();

  // Fire round-start event before player 0's first turn each round
  if(GAME.currentPlayerIndex===0) startRound();

  if(p.commsDelay>0){ p.commsDelay--; if(p.commsDelay===0) addLog(`${p.name}: Comms Delay resolved.`,'system'); }
  addLog(`━━ ${p.name} (${p.faction.name}) — Turn ${GAME.turn} ━━`,'system');

  // Individual event only on event-type spaces (not random any more — round event handles it)
  if(BOARD_SPACES[p.position].type==='event'&&!p.skipNextEvent) triggerEventCard();
  else if(p.skipNextEvent){ p.skipNextEvent=false; addLog(`${p.name}: Event skipped (Cryo-Sleep).`,'system'); }

  p.funding+=p.faction.fundingPerTurn;
  addLog(`${p.name}: +${p.faction.fundingPerTurn} Funding → ${p.funding}.`,'system');
  p.applyRolePenalties();
  if(p.forcedRest){ p.rest(); p.actionsRemaining=Math.max(0,p.actionsRemaining-1); p.forcedRest=false; }
  updateUI();
}

function triggerEventCard(){
  if(GAME.eventDeck.length===0) GAME.eventDeck=shuffle(EVENT_CARDS);
  const card=GAME.eventDeck.pop();
  const doubled=GAME.doubleNextEvent||(GAME.currentPlayer&&GAME.currentPlayer.doubleNextEvent);
  GAME.doubleNextEvent=false;
  if(GAME.currentPlayer) GAME.currentPlayer.doubleNextEvent=false;
  addLog(`! EVENT: "${card.name}"`,'event');
  showCard(card,'event');
  if(GAME.currentPlayer) card.effect(GAME.currentPlayer);
  if(doubled){ addLog('EVENT DOUBLED!','warn'); if(GAME.currentPlayer) card.effect(GAME.currentPlayer); }
  updateUI();
}

function triggerPolicyCard(){
  if(GAME.policyDeck.length===0) GAME.policyDeck=shuffle(POLICY_CARDS);
  const card=GAME.policyDeck.pop();
  const p=GAME.currentPlayer;
  if(p.faction.policyProtection==='very_strong'){
    addLog(`⚖ POLICY: "${card.name}" — ESA immune.`,'warn');
    const orig=GAME.players; GAME.players=GAME.players.filter(pl=>pl!==p); card.effect(); GAME.players=orig; return;
  }
  addLog(`⚖ POLICY: "${card.name}"`,'warn');
  showCard(card,'policy'); card.effect(); updateUI();
}

function endTurn(){
  const p=GAME.currentPlayer;
  p.applyDecay(); updateUI();
  if(GAME.isOver) return;
  if(GAME.players.every(pl=>pl.crew.every(c=>c.isCritical()))){ endGame('All crews collapsed.','loss',null,'Every faction\'s crew succumbed to the void. Humanity\'s first great expansion ends in tragedy.'); return; }

  GAME.currentPlayerIndex=(GAME.currentPlayerIndex+1)%GAME.players.length;
  GAME.turn++;
  if(GAME.currentPlayerIndex===0){ GAME.round++; GAME.roundEventFired=false; } // new round: reset event flag
  startTurn();
}

// ================================================================
// 8. LANDING PROMPT (Moon / Mars)
// ================================================================
let pendingMove=null;

function showLandingPrompt(body){
  const prompt=document.getElementById('landing-prompt');
  const title=document.getElementById('landing-title');
  const text=document.getElementById('landing-body');
  if(body==='moon'){
    title.textContent='Land on the Moon?';
    text.textContent='You are passing the Moon. Would you like to stop and establish a colony site here (5 Colony Points, grants Policy Shield)? Or continue deeper into space?';
  } else {
    title.textContent='Land on Mars?';
    text.textContent='You are passing Mars. Would you like to stop and begin colonization here (12 Colony Points)? Or push on to Deep Space for maximum reward?';
  }
  prompt.classList.remove('hidden');
}

document.getElementById('btn-landing-yes').addEventListener('click',()=>{
  document.getElementById('landing-prompt').classList.add('hidden');
  if(!pendingMove) return;
  const {player}=pendingMove;
  const landPos=pendingMove.destination>5&&pendingMove.destination<8? 5 : 8;
  // Land at Moon (5) or Mars (8)
  const actualLand=document.getElementById('landing-title').textContent.includes('Moon')?5:8;
  pendingMove=null;
  player._completeMove(actualLand);
  spendAction();
});

document.getElementById('btn-landing-yes').addEventListener('click',()=>{
  document.getElementById('landing-prompt').classList.add('hidden');
  if(!pendingMove) return;
  const {player}=pendingMove;
  const isMoon=document.getElementById('landing-title').textContent.includes('Moon');
  const landPos=isMoon? 5 : 10;
  pendingMove=null;
  player._completeMove(landPos);
  spendAction();
});

// ================================================================
// 9. BOARD DRAWING
// ================================================================
function seededRng(seed){
  let s=seed|0;
  return()=>{ s=Math.imul(s^s>>>15,1|s); s^=s+Math.imul(s^s>>>7,61|s); return((s^s>>>14)>>>0)/4294967296; };
}

let STATIC=null, ANIM_T=0, RAF_ID=null;

function resizeCanvasToDisplaySize(canvas){
  const dpr=window.devicePixelRatio||1;
  const rect=canvas.getBoundingClientRect();
  const w=Math.round(rect.width*dpr), h=Math.round(rect.height*dpr);
  if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
  const ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return ctx;
}

function buildStaticData(W,H){
  const r=seededRng(137);
  const faint=[]; for(let i=0;i<600;i++) faint.push({x:r()*W,y:r()*H,rad:r()*0.9+0.2,a:r()*0.30+0.06});
  const mid=[];   for(let i=0;i<130;i++) mid.push({x:r()*W,y:r()*H*0.75,rad:r()*1.3+0.6,a:r()*0.45+0.22});
  const bright=[]; for(let i=0;i<16;i++) bright.push({
    x:r()*W, y:r()*H*0.70, rad:r()*1.8+1.1, a:r()*0.4+0.5,
    spikeLen:r()*14+7, color:r()<0.3?'#ffd0a0':r()<0.5?'#a0c0ff':'#ffffff'
  });

  // Asteroid belt particles — clustered around spaces 6–8 (xf 0.42–0.63)
  const r2=seededRng(314); const belts=[];
  for(let i=0;i<380;i++){
    const bx=W*(0.40+r2()*0.26);       // belt x span
    const by=H*(0.10+r2()*0.82);       // full height scatter
    belts.push({x:bx,y:by,r:r2()*2.8+0.3,a:r2()*0.28+0.05,hue:18+r2()*35,
                vx:(r2()-0.5)*0.18, vy:(r2()-0.5)*0.08}); // slow drift velocities
  }
  STATIC={faint,mid,bright,belts,_W:W,_H:H};
}

function drawBoard(){
  if(RAF_ID) cancelAnimationFrame(RAF_ID);
  RAF_ID=requestAnimationFrame(_boardLoop);
}

function _boardLoop(){
  const canvas=document.getElementById('board-canvas');
  if(!canvas){ RAF_ID=requestAnimationFrame(_boardLoop); return; }
  const ctx=resizeCanvasToDisplaySize(canvas);
  const rect=canvas.getBoundingClientRect();
  const W=rect.width, H=rect.height;
  if(!W||!H){ RAF_ID=requestAnimationFrame(_boardLoop); return; }
  if(!STATIC||STATIC._W!==W||STATIC._H!==H) buildStaticData(W,H);

  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Layer order: bg → stars → nebula/milky way → asteroid belt cloud →
  //              LEO rings → radiation arc → path lines → planet art →
  //              board nodes (on top of planets) → player tokens
  _drawBg(ctx,W,H);
  _drawMilkyWay(ctx,W,H);
  _drawStars(ctx,W,H);
  _drawAsteroidBeltCloud(ctx,W,H);   // visible belt cloud in the board region
  _drawLEORings(ctx,W,H);
  _drawRadiationArc(ctx,W,H);
  _drawPathLines(ctx,W,H);           // path drawn BEFORE planets so planets sit on top
  _drawPlanetArt(ctx,W,H);           // rich planet renders at each landmark position
  _drawBoardNodes(ctx,W,H);          // node rings, numbers, labels on top of planets
  _drawPlayerTokens(ctx,W,H);

  ANIM_T+=0.008;
  RAF_ID=requestAnimationFrame(_boardLoop);
}

// ── Background ──
function _drawBg(ctx,W,H){
  const g=ctx.createLinearGradient(0,0,W*0.2,H);
  g.addColorStop(0,'#06091a'); g.addColorStop(0.5,'#070b1e'); g.addColorStop(1,'#040612');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  // Vignette
  const v=ctx.createRadialGradient(W*.5,H*.5,H*.1,W*.5,H*.5,W*.7);
  v.addColorStop(0,'transparent'); v.addColorStop(1,'rgba(0,0,0,0.55)');
  ctx.fillStyle=v; ctx.fillRect(0,0,W,H);
}

// ── Milky Way diagonal haze ──
function _drawMilkyWay(ctx,W,H){
  ctx.save(); ctx.translate(W*.5,H*.5); ctx.rotate(-0.22);
  const bw=W*.6,bh=H*1.8;
  const g=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  g.addColorStop(0,'transparent'); g.addColorStop(0.3,'rgba(70,90,170,.035)');
  g.addColorStop(0.5,'rgba(110,130,210,.055)'); g.addColorStop(0.7,'rgba(50,70,150,.025)');
  g.addColorStop(1,'transparent');
  ctx.fillStyle=g; ctx.fillRect(-bw/2,-bh/2,bw,bh); ctx.restore();
}

// ── Stars ──
function _drawStars(ctx,W,H){
  if(!STATIC) return;
  const {faint,mid,bright}=STATIC, t=ANIM_T;
  faint.forEach(s=>{ ctx.fillStyle=`rgba(200,215,255,${s.a})`; ctx.beginPath(); ctx.arc(s.x,s.y,s.rad,0,Math.PI*2); ctx.fill(); });
  mid.forEach((s,i)=>{
    const a=Math.max(.08,s.a+Math.sin(t*1.4+i*.8)*.07);
    ctx.fillStyle=`rgba(220,230,255,${a})`; ctx.beginPath(); ctx.arc(s.x,s.y,s.rad,0,Math.PI*2); ctx.fill();
  });
  bright.forEach((s,i)=>{
    const alpha=Math.max(.18,s.a+Math.sin(t*.7+i*1.4)*.14);
    const g=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,s.rad*3.5);
    g.addColorStop(0,s.color); g.addColorStop(1,'transparent');
    ctx.globalAlpha=alpha*.45; ctx.fillStyle=g; ctx.beginPath(); ctx.arc(s.x,s.y,s.rad*3.5,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=alpha; ctx.fillStyle=s.color; ctx.beginPath(); ctx.arc(s.x,s.y,s.rad,0,Math.PI*2); ctx.fill();
    // 4-point spike
    ctx.globalAlpha=alpha*.2; ctx.strokeStyle=s.color; ctx.lineWidth=.5;
    const sl=s.spikeLen, rot=Math.sin(t*.18+i)*.04;
    for(let k=0;k<4;k++){
      const a=rot+k*Math.PI/2;
      ctx.beginPath(); ctx.moveTo(s.x-Math.cos(a)*sl,s.y-Math.sin(a)*sl);
      ctx.lineTo(s.x+Math.cos(a)*sl,s.y+Math.sin(a)*sl); ctx.stroke();
    }
    ctx.globalAlpha=1;
  });
}

// ── Asteroid belt cloud — rendered in the belt zone (x 0.40–0.66W) ──
function _drawAsteroidBeltCloud(ctx,W,H){
  if(!STATIC) return;
  const t=ANIM_T;

  // Soft orange-brown glow bands across the belt region
  [{cx:W*.47,cy:H*.40,rx:W*.10,ry:H*.32},{cx:W*.54,cy:H*.55,rx:W*.08,ry:H*.25},{cx:W*.60,cy:H*.30,rx:W*.07,ry:H*.28}].forEach(b=>{
    const bg=ctx.createRadialGradient(b.cx,b.cy,0,b.cx,b.cy,Math.max(b.rx,b.ry));
    bg.addColorStop(0,'rgba(180,120,50,.060)'); bg.addColorStop(1,'transparent');
    ctx.save(); ctx.scale(b.rx/Math.max(b.rx,b.ry),b.ry/Math.max(b.rx,b.ry));
    ctx.fillStyle=bg;
    ctx.beginPath(); ctx.arc(b.cx/(b.rx/Math.max(b.rx,b.ry)),b.cy/(b.ry/Math.max(b.rx,b.ry)),Math.max(b.rx,b.ry),0,Math.PI*2);
    ctx.fill(); ctx.restore();
  });

  // Individual drifting asteroids
  STATIC.belts.forEach((ast,i)=>{
    const drift=t*0.4;
    const dx=Math.sin(drift+i*0.7)*1.4*ast.vx*80;
    const dy=Math.cos(drift*0.6+i*0.5)*1.4*ast.vy*80;
    const a=Math.max(.03,ast.a+Math.sin(t*.35+i*.4)*.03);
    ctx.fillStyle=`hsla(${ast.hue},40%,58%,${a})`;
    ctx.beginPath(); ctx.arc(ast.x+dx,ast.y+dy,ast.r,0,Math.PI*2); ctx.fill();
  });

  // "Asteroid Belt" label in the belt zone
  ctx.save();
  ctx.font=`italic bold ${Math.round(W*.011)}px Georgia,serif`;
  ctx.fillStyle='rgba(220,155,65,.50)';
  ctx.textAlign='center';
  ctx.fillText('— Asteroid Belt —', W*.535, H*.86);
  ctx.restore();
}

// ── LEO orbital rings around Earth ──
function _drawLEORings(ctx,W,H){
  const layout=SPACE_LAYOUT[0];
  const ex=layout.xf*W, ey=layout.yf*H, er=W*0.050;
  [{rxM:1.7,ryM:.38,a:.25},{rxM:2.3,ryM:.52,a:.15},{rxM:2.9,ryM:.66,a:.08}].forEach(ring=>{
    ctx.save(); ctx.strokeStyle=`rgba(80,160,255,${ring.a})`; ctx.lineWidth=1.0;
    ctx.beginPath(); ctx.ellipse(ex,ey,er*ring.rxM,er*ring.ryM,0,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  });
  ctx.save();
  ctx.font=`${Math.round(W*.011)}px 'Courier New',monospace`;
  ctx.fillStyle='rgba(80,140,255,.30)'; ctx.textAlign='center';
  ctx.fillText('LEO', ex+er*1.9, ey+er*.60);
  ctx.restore();
}

// ── Radiation arc along the lower half of the board ──
function _drawRadiationArc(ctx,W,H){
  ctx.save();
  ctx.strokeStyle='rgba(200,60,20,.55)'; ctx.lineWidth=W*.0022;
  ctx.setLineDash([W*.014,W*.010]);
  ctx.lineDashOffset=ANIM_T*W*.08;
  ctx.beginPath(); ctx.ellipse(W*.50,H*1.20,W*.50,H*.70,0,-Math.PI*.80,-Math.PI*.20);
  ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  ctx.save();
  ctx.font=`italic ${Math.round(W*.013)}px Georgia,serif`;
  ctx.fillStyle='rgba(200,70,30,.50)'; ctx.textAlign='center';
  ctx.fillText('— High Radiation Zone —', W*.50, H*.93);
  ctx.restore();
}

// ── Path lines ──
function _drawPathLines(ctx,W,H){
  const pts=SPACE_LAYOUT.map(l=>({x:l.xf*W,y:l.yf*H}));
  // Main route: 0→1→2→3→4→6→7→8→9→10→11
  const mainRoute=[0,1,2,3,4,6,7,8,9,10,11];
  // Moon branch: 4→5 (and 5 connects back to 6 as optional)
  const moonBranch=[4,5];
  const moonReturn=[5,6];

  // Glowing track shadow
  ctx.save();
  ctx.strokeStyle='rgba(30,100,255,0.18)'; ctx.lineWidth=W*0.012;
  ctx.lineJoin='round'; ctx.lineCap='round'; ctx.filter='blur(3px)';
  ctx.beginPath(); mainRoute.forEach((si,i)=>i===0?ctx.moveTo(pts[si].x,pts[si].y):ctx.lineTo(pts[si].x,pts[si].y)); ctx.stroke();
  ctx.filter='none'; ctx.restore();

  // Main track solid line
  ctx.save();
  ctx.strokeStyle='rgba(60,150,255,0.65)'; ctx.lineWidth=W*0.0038;
  ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath(); mainRoute.forEach((si,i)=>i===0?ctx.moveTo(pts[si].x,pts[si].y):ctx.lineTo(pts[si].x,pts[si].y)); ctx.stroke();
  ctx.restore();

  // Animated flow dash on main route
  ctx.save();
  ctx.strokeStyle='rgba(120,200,255,0.35)'; ctx.lineWidth=W*0.002;
  ctx.setLineDash([W*0.018,W*0.014]);
  ctx.lineDashOffset=-(ANIM_T*W*0.07);
  ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath(); mainRoute.forEach((si,i)=>i===0?ctx.moveTo(pts[si].x,pts[si].y):ctx.lineTo(pts[si].x,pts[si].y)); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();

  // Moon branch (dashed silver)
  [moonBranch, moonReturn].forEach(branch=>{
    ctx.save();
    ctx.strokeStyle='rgba(200,192,176,0.55)'; ctx.lineWidth=W*0.0025;
    ctx.setLineDash([W*0.010,W*0.007]);
    ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.beginPath(); branch.forEach((si,i)=>i===0?ctx.moveTo(pts[si].x,pts[si].y):ctx.lineTo(pts[si].x,pts[si].y)); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  });

  // Direction arrows on main route
  for(let idx=0;idx<mainRoute.length-1;idx++){
    const ai=mainRoute[idx],bi=mainRoute[idx+1];
    const ax=pts[ai].x,ay=pts[ai].y,bx=pts[bi].x,by=pts[bi].y;
    const mx=(ax+bx)/2,my=(ay+by)/2,ang=Math.atan2(by-ay,bx-ax),sz=W*0.006;
    ctx.save(); ctx.translate(mx,my); ctx.rotate(ang);
    ctx.fillStyle='rgba(80,170,255,0.50)';
    ctx.beginPath(); ctx.moveTo(sz,0); ctx.lineTo(-sz*.65,sz*.45); ctx.lineTo(-sz*.65,-sz*.45); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Moon branch label
  ctx.save();
  ctx.font=`italic ${Math.round(W*.009)}px Georgia,serif`;
  ctx.fillStyle='rgba(200,192,176,0.40)'; ctx.textAlign='center';
  ctx.fillText('Moon Branch', pts[5].x+W*.045, (pts[4].y+pts[5].y)/2);
  ctx.restore();
}

// ── Rich planet art drawn AT each landmark's board position ──
function _drawPlanetArt(ctx,W,H){
  SPACE_LAYOUT.forEach((layout,i)=>{
    if(!layout.planet) return;
    const x=layout.xf*W, y=layout.yf*H;
    switch(layout.planet){
      case 'earth':    _planetEarth(ctx,x,y,W*0.052); break;
      case 'iss':      _planetISS(ctx,x,y,W*0.020,W); break;
      case 'moon':     _planetMoon(ctx,x,y,W*0.044); break;
      case 'mars':     _planetMars(ctx,x,y,W*0.048); break;
      case 'deepspace':_planetDeepSpace(ctx,x,y,W*0.024); break;
    }
  });
}

function _planetEarth(ctx,x,y,r){
  const t=ANIM_T;
  // Atmosphere glow
  const atm=ctx.createRadialGradient(x,y,r*.82,x,y,r*1.65);
  atm.addColorStop(0,'rgba(60,140,255,.30)'); atm.addColorStop(.5,'rgba(40,90,200,.08)'); atm.addColorStop(1,'transparent');
  ctx.fillStyle=atm; ctx.beginPath(); ctx.arc(x,y,r*1.65,0,Math.PI*2); ctx.fill();
  // Planet body
  const pg=ctx.createRadialGradient(x-r*.28,y-r*.28,r*.04,x,y,r);
  pg.addColorStop(0,'#4090ff'); pg.addColorStop(.3,'#1a5acc'); pg.addColorStop(.65,'#0a2a7a'); pg.addColorStop(1,'#040e2c');
  ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  // Continents
  ctx.save(); ctx.beginPath(); ctx.arc(x,y,r*.98,0,Math.PI*2); ctx.clip();
  const d=Math.sin(t*.14)*r*.05;
  ctx.fillStyle='rgba(38,120,55,.60)';
  ctx.beginPath();ctx.ellipse(x-r*.10+d,y-r*.16,r*.34,r*.26,.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(x+r*.28+d,y+r*.10,r*.19,r*.29,-.4,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(x-r*.32+d,y+r*.28,r*.16,r*.11,.9,0,Math.PI*2);ctx.fill();
  // Clouds
  ctx.fillStyle='rgba(255,255,255,.18)';
  ctx.beginPath();ctx.ellipse(x+r*.06+d,y-r*.38,r*.34,r*.08,.25,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(x-r*.16+d,y+r*.25,r*.26,r*.07,-.2,0,Math.PI*2);ctx.fill();
  // Night-side shadow
  ctx.fillStyle='rgba(0,0,0,.30)';
  ctx.beginPath(); ctx.arc(x+r*.18,y,r*1.01,0,Math.PI*2); ctx.arc(x,y,r*1.01,0,Math.PI*2,true); ctx.fill();
  ctx.restore();
  // Rim light
  const rim=ctx.createRadialGradient(x,y,r*.86,x,y,r*1.06);
  rim.addColorStop(0,'rgba(70,150,255,.40)'); rim.addColorStop(1,'transparent');
  ctx.fillStyle=rim; ctx.beginPath(); ctx.arc(x,y,r*1.06,0,Math.PI*2); ctx.fill();
}

function _planetISS(ctx,x,y,r,W){
  // Soft glow halo
  const g=ctx.createRadialGradient(x,y,0,x,y,r*8);
  g.addColorStop(0,'rgba(140,190,255,.18)'); g.addColorStop(1,'transparent');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r*8,0,Math.PI*2); ctx.fill();
  const sz=W*.024;
  ctx.save(); ctx.translate(x,y); ctx.rotate(Math.sin(ANIM_T*.28)*.05);
  // Central truss
  ctx.fillStyle='#a0aac0'; ctx.fillRect(-sz*.13,-sz*.055,sz*.26,sz*.11);
  // Solar panels
  ctx.fillStyle='#1a3a8a'; ctx.fillRect(-sz*.58,-sz*.05,sz*.40,sz*.10); ctx.fillRect(sz*.18,-sz*.05,sz*.40,sz*.10);
  // Panel grid lines
  ctx.strokeStyle='rgba(80,130,255,.45)'; ctx.lineWidth=.5;
  for(let i=1;i<4;i++){
    ctx.beginPath();ctx.moveTo(-sz*.58+i*sz*.10,-sz*.05);ctx.lineTo(-sz*.58+i*sz*.10,sz*.05);ctx.stroke();
    ctx.beginPath();ctx.moveTo(sz*.18+i*sz*.10,-sz*.05);ctx.lineTo(sz*.18+i*sz*.10,sz*.05);ctx.stroke();
  }
  ctx.restore();
}

function _planetMoon(ctx,x,y,r){
  // Subtle glow
  const g=ctx.createRadialGradient(x,y,r*.55,x,y,r*1.9);
  g.addColorStop(0,'rgba(200,195,185,.14)'); g.addColorStop(1,'transparent');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r*1.9,0,Math.PI*2); ctx.fill();
  // Body
  const mg=ctx.createRadialGradient(x-r*.24,y-r*.24,r*.04,x,y,r);
  mg.addColorStop(0,'#ddd5c5'); mg.addColorStop(.5,'#a89888'); mg.addColorStop(1,'#504840');
  ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  // Craters
  [{dx:-.26,dy:-.17,cr:.17},{dx:.21,dy:.27,cr:.13},{dx:-.07,dy:.36,cr:.10},
   {dx:.31,dy:-.09,cr:.14},{dx:-.37,dy:.11,cr:.10},{dx:.04,dy:-.28,cr:.09}].forEach(c=>{
    ctx.fillStyle='rgba(35,28,20,.42)'; ctx.beginPath(); ctx.arc(x+c.dx*r,y+c.dy*r,c.cr*r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(210,195,175,.22)'; ctx.lineWidth=.6;
    ctx.beginPath(); ctx.arc(x+c.dx*r,y+c.dy*r,c.cr*r,0,Math.PI*2); ctx.stroke();
  });
  // Shadow
  ctx.save(); ctx.beginPath(); ctx.arc(x,y,r*1.01,0,Math.PI*2); ctx.clip();
  ctx.fillStyle='rgba(0,0,0,.36)';
  ctx.beginPath(); ctx.arc(x+r*.21,y,r*1.01,0,Math.PI*2); ctx.arc(x,y,r*1.01,0,Math.PI*2,true); ctx.fill();
  ctx.restore();
}

function _planetMars(ctx,x,y,r){
  // Atmosphere
  const ag=ctx.createRadialGradient(x,y,r*.85,x,y,r*1.55);
  ag.addColorStop(0,'rgba(220,100,30,.26)'); ag.addColorStop(1,'transparent');
  ctx.fillStyle=ag; ctx.beginPath(); ctx.arc(x,y,r*1.55,0,Math.PI*2); ctx.fill();
  // Body
  const mg=ctx.createRadialGradient(x-r*.24,y-r*.24,r*.04,x,y,r);
  mg.addColorStop(0,'#e86030'); mg.addColorStop(.35,'#c03818'); mg.addColorStop(.7,'#801808'); mg.addColorStop(1,'#350808');
  ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x,y,r*.98,0,Math.PI*2); ctx.clip();
  // Valles Marineris canyon
  ctx.fillStyle='rgba(100,35,10,.52)';
  ctx.beginPath(); ctx.ellipse(x-r*.08,y+r*.13,r*.42,r*.19,.3,0,Math.PI*2); ctx.fill();
  // Polar ice caps
  ctx.fillStyle='rgba(240,242,255,.58)';
  ctx.beginPath(); ctx.ellipse(x,y-r*.80,r*.25,r*.09,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x,y+r*.82,r*.15,r*.06,0,0,Math.PI*2); ctx.fill();
  // Dust storm wisps
  ctx.fillStyle='rgba(215,115,50,.18)';
  ctx.beginPath(); ctx.ellipse(x+r*.04,y+r*.34,r*.48,r*.09,.6,0,Math.PI*2); ctx.fill();
  // Shadow
  ctx.fillStyle='rgba(0,0,0,.26)';
  ctx.beginPath(); ctx.arc(x+r*.19,y,r*1.01,0,Math.PI*2); ctx.arc(x,y,r*1.01,0,Math.PI*2,true); ctx.fill();
  ctx.restore();
}

function _planetDeepSpace(ctx,x,y,r){
  const t=ANIM_T;
  // Nebula layers
  for(let i=4;i>0;i--){
    const nb=ctx.createRadialGradient(x,y,0,x,y,r*i*.95);
    nb.addColorStop(0,`rgba(55,8,125,${.13/i})`); nb.addColorStop(1,'transparent');
    ctx.fillStyle=nb; ctx.beginPath(); ctx.arc(x,y,r*i*.95,0,Math.PI*2); ctx.fill();
  }
  // Accretion spirals
  ctx.save();
  for(let sp=0;sp<2;sp++){
    ctx.beginPath();
    for(let a=0;a<Math.PI*3.4;a+=.07){
      const rad=r*(.10+a*.09), sa=a+sp*Math.PI+t*.38;
      const px=x+Math.cos(sa)*rad, py=y+Math.sin(sa)*rad*.36;
      a<.07?ctx.moveTo(px,py):ctx.lineTo(px,py);
    }
    ctx.strokeStyle=`rgba(140,55,255,${.22+Math.sin(t*.45)*.06})`;
    ctx.lineWidth=1.1; ctx.shadowColor='rgba(140,55,255,.35)'; ctx.shadowBlur=5; ctx.stroke();
  }
  ctx.shadowBlur=0; ctx.restore();
  // Black hole core
  const core=ctx.createRadialGradient(x,y,0,x,y,r*.88);
  core.addColorStop(0,'rgba(0,0,0,.96)'); core.addColorStop(.4,'rgba(18,0,45,.58)'); core.addColorStop(1,'transparent');
  ctx.fillStyle=core; ctx.beginPath(); ctx.arc(x,y,r*.88,0,Math.PI*2); ctx.fill();
  // Event horizon ring
  const eh=ctx.createRadialGradient(x,y,r*.52,x,y,r*.90);
  eh.addColorStop(0,'rgba(175,95,255,.55)'); eh.addColorStop(1,'rgba(75,15,155,0)');
  ctx.fillStyle=eh; ctx.beginPath(); ctx.arc(x,y,r*.90,0,Math.PI*2); ctx.fill();
  // Pulsing center star
  const pulse=.65+Math.sin(t*2)*.32;
  ctx.fillStyle=`rgba(255,255,255,${pulse})`; ctx.beginPath(); ctx.arc(x,y,r*.07,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=`rgba(200,155,255,${pulse*.45})`; ctx.lineWidth=.5;
  ctx.beginPath(); ctx.moveTo(x-r*.48,y); ctx.lineTo(x+r*.48,y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x,y-r*.48); ctx.lineTo(x,y+r*.48); ctx.stroke();
}

// ── Board nodes on top of the planet art ──
function _drawBoardNodes(ctx,W,H){
  const pts=SPACE_LAYOUT.map(l=>({x:l.xf*W,y:l.yf*H}));

  SPACE_LAYOUT.forEach((layout,i)=>{
    const sp=BOARD_SPACES[i];
    const x=pts[i].x, y=pts[i].y;

    if(layout.landmark){
      const r=W*0.030;

      // Outer glow ring
      ctx.save();
      ctx.shadowColor=sp.color; ctx.shadowBlur=22;
      ctx.strokeStyle=sp.color; ctx.lineWidth=2.8;
      ctx.globalAlpha=0.85;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
      ctx.shadowBlur=0; ctx.globalAlpha=1; ctx.restore();

      // Second inner ring (dashes for colony sites)
      if(sp.type==='colony'){
        ctx.save(); ctx.strokeStyle=sp.color+'99'; ctx.lineWidth=1.2;
        ctx.setLineDash([4,4]); ctx.beginPath(); ctx.arc(x,y,r*1.28,0,Math.PI*2); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }

      // Space number badge (top-left of planet)
      const badgeR=W*0.012, bx=x-r*.72, by=y-r*.72;
      ctx.fillStyle=sp.color;
      ctx.beginPath(); ctx.arc(bx,by,badgeR,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#000';
      ctx.font=`bold ${Math.round(badgeR*1.35)}px monospace`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(i,bx,by); ctx.textBaseline='alphabetic';

      // Name label
      const isAbove=(i===5); // Moon is above its node
      const labelY=isAbove? y-r-W*0.016 : y+r+W*0.024;
      ctx.save();
      ctx.shadowColor=sp.color; ctx.shadowBlur=9; ctx.fillStyle='#fff';
      ctx.font=`bold ${Math.round(W*0.013)}px 'Courier New',monospace`;
      ctx.textAlign='center'; ctx.fillText(sp.shortName,x,labelY);
      ctx.shadowBlur=0; ctx.restore();

      // Colony pts
      if(sp.colonyPoints>0){
        const ptY=isAbove? y-r-W*0.030 : y+r+W*0.038;
        ctx.font=`${Math.round(W*0.0095)}px monospace`;
        ctx.fillStyle=sp.color; ctx.textAlign='center';
        ctx.fillText(`(${sp.colonyPoints} pts)`,x,ptY);
      }

    } else {
      // Waypoint dot
      const r=W*0.014;
      ctx.save();
      ctx.shadowColor=sp.color; ctx.shadowBlur=9;
      ctx.fillStyle='#060a1c'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=sp.color; ctx.lineWidth=2.0;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.fillStyle=sp.color;
      ctx.font=`bold ${Math.round(r*1.05)}px monospace`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(i,x,y); ctx.textBaseline='alphabetic';
      ctx.restore();

      // Label below
      ctx.font=`${Math.round(W*0.0082)}px 'Courier New',monospace`;
      ctx.fillStyle=sp.color+'bb'; ctx.textAlign='center';
      ctx.fillText(sp.shortName,x,y+r+W*0.013);
    }
  });
}

function _drawPlayerTokens(ctx,W,H){
  if(!GAME.players.length) return;
  const pts=SPACE_LAYOUT.map(l=>({x:l.xf*W,y:l.yf*H}));
  GAME.players.forEach(pl=>{
    const layout=SPACE_LAYOUT[pl.position];
    const x=pts[pl.position].x, y=pts[pl.position].y;
    const r=W*0.015;
    const offset=(pl.index-(GAME.players.length-1)/2)*r*2.5;
    // Tokens sit above landmark nodes, beside waypoints
    const ty=layout.landmark? y-W*0.048 : y-W*0.028;
    const tx=x+offset;

    // Glow
    ctx.shadowColor=pl.faction.color; ctx.shadowBlur=14;
    ctx.fillStyle=pl.faction.color; ctx.beginPath(); ctx.arc(tx,ty,r,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    // Border
    ctx.strokeStyle='rgba(0,0,0,.75)'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.arc(tx,ty,r,0,Math.PI*2); ctx.stroke();
    // Initial
    ctx.fillStyle='#000';
    ctx.font=`bold ${Math.round(r*1.05)}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(pl.name[0].toUpperCase(),tx,ty);
    ctx.textBaseline='alphabetic';
    // Name tag
    ctx.fillStyle=pl.faction.color;
    ctx.font=`${Math.round(W*0.0085)}px monospace`;
    ctx.textAlign='center';
    ctx.fillText(pl.name,tx,ty+r+W*0.012);
  });
}

// ================================================================
// 10. UI UPDATES
// ================================================================
function updateUI(){
  if(!GAME.players.length) return;
  const p=GAME.currentPlayer;

  document.getElementById('lbl-round').textContent=`ROUND ${GAME.round}`;
  document.getElementById('lbl-turn').textContent=`TURN ${GAME.turn}`;
  document.getElementById('lbl-current-player').textContent=`${p.name} — ${p.faction.name}`;
  document.getElementById('lbl-actions').textContent=`${p.actionsRemaining} ACTIONS LEFT`;
  const dot=document.getElementById('lbl-faction-color');
  dot.style.background=p.faction.color; dot.style.boxShadow=`0 0 8px ${p.faction.color}`;

  document.getElementById('lbl-location').textContent=BOARD_SPACES[p.position].shortName;
  document.getElementById('val-funding').textContent=p.funding;
  document.getElementById('val-colony').textContent=p.colonyPoints;
  document.getElementById('val-location').textContent=BOARD_SPACES[p.position].name;

  const sp=BOARD_SPACES[p.position];
  document.getElementById('row-infra').style.display=(sp.type==='colony'||sp.type==='safe')?'flex':'none';
  document.getElementById('val-infra').textContent=`${p.infraTurns}/3`;
  document.getElementById('row-rest-streak').style.display=p.restStreak>0?'flex':'none';
  document.getElementById('val-rest-streak').textContent=p.restStreak;

  document.getElementById('faction-name-display').textContent=p.faction.fullName;
  document.getElementById('faction-name-display').style.color=p.faction.color;
  document.getElementById('faction-ability-display').textContent=p.faction.ability;

  // Crew
  const crewDiv=document.getElementById('crew-display');
  crewDiv.innerHTML='';
  p.crew.forEach(c=>{
    const el=document.createElement('div'); el.className='crew-member';
    el.innerHTML=`
      <div class="crew-name">${c.role}${c.isCritical()?'<span class="crew-warning">⚠ CRITICAL</span>':''}</div>
      ${_statBar('☢ Radiation',c.radiation,5,'#ff4444',c.radiation>=3)}
      ${_statBar('𝗓ᶻ Sleep',c.sleep,5,'#4488ff',c.sleep<=2)}
      ${_statBar('⚡ Morale',c.morale,5,'#ffaa00',c.morale<=2)}
    `;
    crewDiv.appendChild(el);
  });

  // Repro tokens
  const rd=document.getElementById('repro-tokens');
  rd.innerHTML=p.reproRiskTokens===0
    ?'<span style="font-size:10px;color:#1a3a5a;">None</span>'
    :Array.from({length:p.reproRiskTokens},()=>'<div class="repro-token"></div>').join('');

  // Action buttons — grey when unusable
  const none=p.actionsRemaining<=0;
  document.getElementById('btn-move').disabled=none||p.moveBlocked;
  document.getElementById('btn-move-back').disabled=none||p.position<=0;
  document.getElementById('btn-rest').disabled=none;
  document.getElementById('btn-buy-opp').disabled=none||p.funding<2;
  document.getElementById('btn-deploy').disabled=none||p.locked;
  document.getElementById('btn-research').disabled=none;
  document.getElementById('btn-negotiate').disabled=none||!p.canNegotiate||p.locked;

  // Hand — show card name + description
  const handDiv=document.getElementById('hand-display');
  if(p.hand.length===0){
    handDiv.innerHTML='<span class="empty-hand">— None —</span>';
  } else {
    handDiv.innerHTML='';
    p.hand.forEach((card,i)=>{
      const el=document.createElement('div'); el.className='hand-card';
      el.innerHTML=`
        <div class="hand-card-name">${card.name}</div>
        <div class="hand-card-desc">${card.text}</div>
        <div class="hand-card-footer">
          <button class="hand-card-play" onclick="GAME.currentPlayer.playOpportunity(${i});updateUI();">▶ PLAY</button>
        </div>
      `;
      handDiv.appendChild(el);
    });
  }
}

function _statBar(label,value,max,color,danger){
  return `<div class="stat-row"><span class="stat-label">${label}</span><div class="stat-bar-outer"><div class="stat-bar-inner" style="width:${(value/max)*100}%;background:${color};"></div></div><span class="stat-val${danger?' danger':''}">${value}</span></div>`;
}

function showCard(card,type){
  const lbl=document.getElementById('card-deck-label');
  lbl.textContent=(type==='breakdown'?'MENTAL BREAKDOWN':type.toUpperCase());
  lbl.className=type;
  document.getElementById('card-name').textContent=card.name;
  document.getElementById('card-body').textContent=card.text;
  document.getElementById('card-popup').classList.remove('hidden');
}

document.getElementById('btn-dismiss-card').addEventListener('click',()=>{
  document.getElementById('card-popup').classList.add('hidden'); updateUI();
});

function addLog(msg,type='system'){
  const log=document.getElementById('log-entries');
  const el=document.createElement('div');
  el.className=`log-entry ${type}`; el.textContent=msg;
  log.prepend(el);
  while(log.children.length>50) log.removeChild(log.lastChild);
}

// ================================================================
// 11. WIN / LOSS CONDITIONS
// ================================================================
function checkWinCondition(){
  GAME.players.forEach(p=>{
    if(p.colonyPoints>=10&&p.crew.every(c=>c.sleep===5&&c.morale===5)){
      const location=BOARD_SPACES[p.position].name;
      endGame(
        `${p.name} (${p.faction.name}) has established a viable colony!`,
        'win', p,
        `Colony established at ${location} with ${p.colonyPoints} Colony Points.\nAll crew returned at full health — Sleep 5/5, Morale 5/5.\nReproductive Risk tokens accumulated: ${p.reproRiskTokens}.\n\nHumanity's first successful off-world colony is a triumph for ${p.faction.fullName}.`
      );
    }
  });
  const standing=GAME.players.filter(p=>!p.crew.every(c=>c.isCritical()));
  if(standing.length===1&&GAME.players.length>1){
    endGame(
      `${standing[0].name} is the last faction standing!`,
      'win', standing[0],
      `All other factions' crews went critical. ${standing[0].name} (${standing[0].faction.name}) survives with ${standing[0].colonyPoints} Colony Points.`
    );
  }
}

function endGame(message,outcome,winner,detail=''){
  GAME.isOver=true;
  const win=outcome==='win';
  document.getElementById('gameover-icon').textContent=win?'🏆':'💀';
  document.getElementById('gameover-title').textContent=win?'MISSION ACCOMPLISHED':'MISSION FAILED';
  document.getElementById('gameover-text').textContent=message;
  document.getElementById('gameover-detail').textContent=detail;

  const scores=document.getElementById('final-scores');
  scores.innerHTML='';
  GAME.players.forEach(p=>{
    const row=document.createElement('div'); row.className='score-row';
    row.innerHTML=`<span style="color:${p.faction.color}">${p.name} — ${p.faction.name}</span><span class="score-pts">${p.colonyPoints} Colony Pts</span>`;
    scores.appendChild(row);
  });
  showScreen('gameover');
  if(RAF_ID){ cancelAnimationFrame(RAF_ID); RAF_ID=null; }
}

// ================================================================
// 12. RULES OVERLAY
// ================================================================
document.getElementById('btn-rules-toggle').addEventListener('click',()=>{
  document.getElementById('rules-overlay').classList.remove('hidden');
});
document.getElementById('btn-close-rules').addEventListener('click',()=>{
  document.getElementById('rules-overlay').classList.add('hidden');
});

// ================================================================
// 13. SETUP SCREEN
// ================================================================
const factionInfo={
  nasa:    {label:'NASA',         stats:'💰💰 · 🚀×1 · 🛡 Strong'},
  cnsa:    {label:'CNSA',         stats:'💰💰 · 🚀×2 · 🛡 Medium'},
  esa:     {label:'ESA',          stats:'💰 · 🚀×1 · 🛡 Immune'},
  private: {label:'PRIVATE CORP', stats:'💰💰💰 · 🚀×3 · 🛡 None'}
};

function buildSetupUI(){
  const count=parseInt(document.getElementById('player-count').value);
  const container=document.getElementById('faction-selectors');
  container.innerHTML='';
  const defaults=['nasa','cnsa','esa','private'];
  const names=['Commander','Pilot','Engineer','Medic'];
  for(let i=0;i<count;i++){
    const sel=document.createElement('div'); sel.className='faction-selector';
    sel.innerHTML=`
      <label>Player ${i+1}</label>
      <input type="text" id="pname-${i}" value="${names[i]}" placeholder="Enter name"/>
      <label style="margin-top:8px;">Choose Faction</label>
      <div class="faction-options" id="fopts-${i}">
        ${Object.entries(factionInfo).map(([id,f])=>`
          <div class="faction-opt ${id} ${id===defaults[i]?'selected':''}"
               data-faction="${id}" onclick="selectFaction(${i},'${id}')">
            <div class="opt-name">${f.label}</div>
            <div class="opt-stat">${f.stats}</div>
          </div>`).join('')}
      </div>
    `;
    container.appendChild(sel);
  }
}

function selectFaction(playerIndex,factionId){
  document.querySelectorAll(`#fopts-${playerIndex} .faction-opt`).forEach(el=>
    el.classList.toggle('selected',el.dataset.faction===factionId));
}

document.getElementById('player-count').addEventListener('change',buildSetupUI);

// ================================================================
// 14. ACTION BUTTONS
// (Single event listeners — no duplicates)
// ================================================================
function spendAction(){
  GAME.currentPlayer.actionsRemaining--;
  updateUI();
}

document.getElementById('btn-move').addEventListener('click',()=>{
  const p=GAME.currentPlayer;
  if(p.actionsRemaining<=0) return;
  const result=p.move(1);
  if(result===true){ p.restStreak=0; spendAction(); }
  else if(result==='pending'){ p.restStreak=0; /* action spent after prompt resolves */ }
});

document.getElementById('btn-move-back').addEventListener('click',()=>{
  const p=GAME.currentPlayer;
  if(p.actionsRemaining<=0||p.position<=0) return;
  if(p.moveBack()) spendAction();
});

document.getElementById('btn-rest').addEventListener('click',()=>{
  const p=GAME.currentPlayer;
  if(p.actionsRemaining<=0) return;
  p.rest(); spendAction();
});

document.getElementById('btn-buy-opp').addEventListener('click',()=>{
  const p=GAME.currentPlayer;
  if(p.actionsRemaining<=0) return;
  if(p.funding<2){ addLog(`${p.name}: need 2 Funding.`,'warn'); return; }
  p.funding-=2; p.buyOpportunity(); spendAction();
});

document.getElementById('btn-deploy').addEventListener('click',()=>{
  const p=GAME.currentPlayer;
  if(p.actionsRemaining<=0) return;
  if(p.deploy()) spendAction();
});

document.getElementById('btn-research').addEventListener('click',()=>{
  const p=GAME.currentPlayer;
  if(p.actionsRemaining<=0) return;
  p.research(); spendAction();
});

document.getElementById('btn-negotiate').addEventListener('click',()=>{
  const p=GAME.currentPlayer;
  if(p.actionsRemaining<=0) return;
  if(p.negotiate()) spendAction();
});

document.getElementById('btn-end-turn').addEventListener('click',endTurn);
document.getElementById('btn-restart').addEventListener('click',()=>location.reload());

// ================================================================
// 15. INIT
// ================================================================
function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
}

document.getElementById('btn-start-game').addEventListener('click',()=>{
  const count=parseInt(document.getElementById('player-count').value);
  const fallback=['nasa','cnsa','esa','private'];
  GAME.players=[];
  for(let i=0;i<count;i++){
    const name=document.getElementById(`pname-${i}`)?.value||`Player ${i+1}`;
    const fEl=document.querySelector(`#fopts-${i} .faction-opt.selected`);
    const fId=fEl?fEl.dataset.faction:fallback[i];
    GAME.players.push(new Player(name,fId,i));
  }
  GAME.currentPlayerIndex=0; GAME.turn=1; GAME.round=1;
  GAME.isOver=false; GAME.lastReachedPosition=0;
  GAME.consortiumActive=false; GAME.doubleNextEvent=false;
  GAME.roundEventFired=false;
  GAME.eventDeck=shuffle(EVENT_CARDS);
  GAME.policyDeck=shuffle(POLICY_CARDS);
  GAME.opportunityDeck=shuffle(OPPORTUNITY_CARDS);
  GAME.breakdownDeck=shuffle(BREAKDOWN_CARDS);
  STATIC=null;

  showScreen('game');
  updateUI();
  if(RAF_ID) cancelAnimationFrame(RAF_ID);
  RAF_ID=requestAnimationFrame(_boardLoop);
  startTurn();
});

buildSetupUI();
