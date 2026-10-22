import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const DATA_SOURCES = [
  {
    ns: 'melvorD',
    urls: [
      'https://cdn2-main.melvor.net/assets/data/melvorDemo.json',
      'https://melvoridle.com/assets/data/melvorDemo.json',
    ],
  },
  {
    ns: 'melvorF',
    urls: [
      'https://cdn2-main.melvor.net/assets/data/melvorFull.json',
      'https://melvoridle.com/assets/data/melvorFull.json',
    ],
  },
  {
    ns: 'melvorTotH',
    urls: [
      'https://cdn2-main.melvor.net/assets/data/melvorTotH.json',
      'https://melvoridle.com/assets/data/melvorTotH.json',
    ],
  },
  {
    ns: 'melvorAoD',
    urls: [
      'https://cdn2-main.melvor.net/assets/data/melvorExpansion2.json',
      'https://melvoridle.com/assets/data/melvorExpansion2.json',
    ],
  },
  {
    ns: 'melvorItA',
    urls: [
      'https://cdn2-main.melvor.net/assets/data/melvorItA.json',
      'https://cdn2-main.melvor.net/assets/data/melvorExpansion3.json',
      'https://melvoridle.com/assets/data/melvorItA.json',
      'https://melvoridle.com/assets/data/melvorExpansion3.json',
    ],
  },
];

const LANG_URLS = [
  'https://cdn2-main.melvor.net/lang/en.json',
  'https://melvoridle.com/lang/en.json',
  'https://cdn2-main.melvor.net/assets/lang/en.json',
  'https://melvoridle.com/assets/lang/en.json',
];

async function fetchJsonWithFallback(urls, label) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        console.log(`[OK] Fetched ${label} from ${url}`);
        return data;
      }
      console.warn(`[WARN] Skipping ${url} (${res.status}, content-type: ${contentType})`);
    } catch (err) {
      console.warn(`[WARN] Error fetching ${url}: ${err.message}`);
    }
  }
  throw new Error(`Failed to fetch valid JSON for ${label} from any candidate URL.`);
}

function calcCombatLevel(monster) {
  const l = monster.levels || {};
  const prayer = l.Prayer ?? 1;
  const base = 0.25 * ((l.Defence || 1) + (l.Hitpoints || 1) + Math.floor(0.5 * prayer));
  const melee = 0.325 * ((l.Attack || 1) + (l.Strength || 1));
  const ranged = 0.325 * Math.floor(1.5 * (l.Ranged || 1));
  const magic = 0.325 * Math.floor(1.5 * (l.Magic || 1));
  return Math.floor(base + Math.max(melee, ranged, magic));
}

function computeBaseNormalMaxHit(monster, spellsMap, numberMultiplier = 10) {
  const style = monster.attackType;
  const levels = monster.levels || {};
  const stats = monster.equipmentStats || [];
  const getStat = (key) => stats.find((s) => s.key === key)?.value || 0;

  if (style === 'melee') {
    const effectiveLevel = (levels.Strength || 1) + 9;
    const bonus = getStat('meleeStrengthBonus');
    return Math.floor(
      numberMultiplier * (1.3 + effectiveLevel / 10 + bonus / 80 + (effectiveLevel * bonus) / 640)
    );
  }
  if (style === 'ranged') {
    const effectiveLevel = (levels.Ranged || 1) + 9;
    const bonus = getStat('rangedStrengthBonus');
    return Math.floor(
      numberMultiplier * (1.3 + effectiveLevel / 10 + bonus / 80 + (effectiveLevel * bonus) / 640)
    );
  }
  if (style === 'magic') {
    const magicLevel = levels.Magic || 1;
    const bonus = getStat('magicDamageBonus');
    const spellId = monster.spellSelection?.standard || monster.selectedSpell;
    const spell = spellId ? spellsMap.get(spellId) : null;
    if (spell && spell.maxHit !== undefined) {
      return Math.floor(
        spell.maxHit * numberMultiplier * (1 + (magicLevel + 1) / 200) * (1 + bonus / 100)
      );
    }
    const effectiveLevel = magicLevel + 9;
    return Math.floor(
      numberMultiplier * (1.3 + effectiveLevel / 10 + bonus / 80 + (effectiveLevel * bonus) / 640)
    );
  }
  return 0;
}

function applyCategoryModifications(baseIds, mods) {
  const list = [...baseIds];
  for (const mod of mods) {
    if (mod.areas?.add) {
      for (const addRule of mod.areas.add) {
        if (addRule.insertAt === 'After') {
          const idx = list.indexOf(addRule.afterID);
          if (idx !== -1) {
            list.splice(idx + 1, 0, ...addRule.ids);
          } else {
            list.push(...addRule.ids);
          }
        } else if (addRule.insertAt === 'Before') {
          const idx = list.indexOf(addRule.beforeID);
          if (idx !== -1) {
            list.splice(idx, 0, ...addRule.ids);
          } else {
            list.push(...addRule.ids);
          }
        } else {
          list.push(...addRule.ids);
        }
      }
    }
  }
  return list;
}

async function main() {
  const pkgs = {};
  for (const src of DATA_SOURCES) {
    pkgs[src.ns] = await fetchJsonWithFallback(src.urls, src.ns);
  }
  const lang = await fetchJsonWithFallback(LANG_URLS, 'lang/en.json');

  // Build lookup maps across all 5 namespaces
  const attacksMap = new Map();
  const spellsMap = new Map();
  const passivesMap = new Map();
  const effectsMap = new Map();
  const rawMonstersMap = new Map();
  const rawAreasMap = new Map();

  for (const [ns, pkg] of Object.entries(pkgs)) {
    const d = pkg.data || {};
    for (const atk of d.attacks || []) attacksMap.set(`${ns}:${atk.id}`, { ...atk, ns });
    for (const sp of d.attackSpells || []) spellsMap.set(`${ns}:${sp.id}`, { ...sp, ns });
    for (const p of d.combatPassives || []) passivesMap.set(`${ns}:${p.id}`, { ...p, ns });
    for (const e of d.combatEffects || []) effectsMap.set(`${ns}:${e.id}`, { ...e, ns });
    for (const m of d.monsters || []) rawMonstersMap.set(`${ns}:${m.id}`, { ...m, ns, fullId: `${ns}:${m.id}` });
    for (const ca of d.combatAreas || []) rawAreasMap.set(`${ns}:${ca.id}`, { ...ca, ns, fullId: `${ns}:${ca.id}`, areaType: 'combatArea' });
    for (const sa of d.slayerAreas || []) rawAreasMap.set(`${ns}:${sa.id}`, { ...sa, ns, fullId: `${ns}:${sa.id}`, areaType: 'slayerArea' });
    for (const dg of d.dungeons || []) rawAreasMap.set(`${ns}:${dg.id}`, { ...dg, ns, fullId: `${ns}:${dg.id}`, areaType: 'dungeon' });
    for (const sh of d.strongholds || []) rawAreasMap.set(`${ns}:${sh.id}`, { ...sh, ns, fullId: `${ns}:${sh.id}`, areaType: 'stronghold' });
    for (const ad of d.abyssDepths || []) rawAreasMap.set(`${ns}:${ad.id}`, { ...ad, ns, fullId: `${ns}:${ad.id}`, areaType: 'abyssDepth' });
  }

  // Helper to resolve localized names while preserving legacy naming overrides
  const LEGACY_MONSTER_NAMES = {
    'melvorF:TurkulRiders': 'Turkul Riders',
    'melvorF:TurkulArchers': 'Turkul Archers',
    'melvorF:TurkulThrowers': 'Turkul Throwers',
    'melvorAoD:EarthGolem': 'Earth Golem (AoD)',
  };

  function getMonsterDisplayName(fullId) {
    if (LEGACY_MONSTER_NAMES[fullId]) return LEGACY_MONSTER_NAMES[fullId];
    const m = rawMonstersMap.get(fullId);
    if (!m) return fullId;
    const loc = lang[`MONSTER_NAME_${m.id}`];
    return (loc || m.name || m.id).trim();
  }

  function getAreaDisplayName(fullId) {
    const a = rawAreasMap.get(fullId);
    if (!a) return fullId;
    if (fullId === 'melvorAoD:Trickery_Temple') return 'Trickery Temple';
    if (a.areaType === 'combatArea') return (lang[`COMBAT_AREA_NAME_${a.id}`] || a.name).trim();
    if (a.areaType === 'slayerArea') return (lang[`SLAYER_AREA_NAME_${a.id}`] || a.name).trim();
    if (a.areaType === 'dungeon') return (lang[`DUNGEON_NAME_${a.id}`] || a.name).trim();
    if (a.areaType === 'stronghold') return (lang[`STRONGHOLD_NAME_${a.id}`] || a.name).trim();
    if (a.areaType === 'abyssDepth') return (lang[`THE_ABYSS_NAME_${a.id}`] || a.name).trim();
    return a.name.trim();
  }

  function getAttackDisplayName(atk) {
    if (!atk) return '';
    if (atk.id === 'PoisonSplit') return 'Poison Split';
    if (atk.id === 'RollingSnowball') return 'Rolling Snowball';
    return (lang[`SPECIAL_ATTACK_NAME_${atk.id}`] || atk.name || atk.id).trim();
  }

  // Build ordered area lists for Melvor Realm & Abyssal Realm
  const allCategoryMods = {};
  for (const pkg of Object.values(pkgs)) {
    for (const mod of pkg.modifications?.combatAreaCategories || []) {
      if (!allCategoryMods[mod.id]) allCategoryMods[mod.id] = [];
      allCategoryMods[mod.id].push(mod);
    }
  }

  const baseCombatAreaIds = pkgs.melvorD.data.combatAreaCategories.find((c) => c.id === 'CombatAreas').areas;
  const melvorCombatAreaIds = applyCategoryModifications(baseCombatAreaIds, allCategoryMods['melvorD:CombatAreas'] || [])
    .filter((id) => id !== 'melvorD:UnknownArea');

  const baseSlayerAreaIds = pkgs.melvorF.data.combatAreaCategories.find((c) => c.id === 'SlayerAreas').areas;
  const melvorSlayerAreaIds = applyCategoryModifications(baseSlayerAreaIds, allCategoryMods['melvorF:SlayerAreas'] || []);

  const baseDungeonIds = pkgs.melvorD.data.combatAreaCategories.find((c) => c.id === 'Dungeons').areas;
  const bannedMelvorDungeons = new Set([
    'melvorF:Into_the_Mist',
    'melvorF:Impending_Darkness',
    'melvorTotH:Throne_of_the_Herald',
    'melvorItA:Into_The_Abyss', // Into the Abyss is in Abyssal Realm with Reversed Combat Triangle & Abyssal Damage
  ]);
  const melvorDungeonIds = applyCategoryModifications(baseDungeonIds, allCategoryMods['melvorD:Dungeons'] || [])
    .filter((id) => !bannedMelvorDungeons.has(id));

  const melvorStrongholdIds = pkgs.melvorF.data.combatAreaCategories.find((c) => c.id === 'Strongholds').areas;

  const abyssCombatAreaIds = pkgs.melvorItA.data.combatAreaCategories.find((c) => c.id === 'AbyssalCombatAreas').areas;
  const abyssSlayerAreaIds = pkgs.melvorItA.data.combatAreaCategories.find((c) => c.id === 'AbyssalSlayerAreas').areas;
  const abyssStrongholdIds = pkgs.melvorItA.data.combatAreaCategories.find((c) => c.id === 'AbyssalStrongholds').areas;
  const abyssDepthIds = pkgs.melvorItA.data.combatAreaCategories.find((c) => c.id === 'TheAbyss').areas;
  const abyssDungeonIds = ['melvorItA:Into_The_Abyss', ...abyssDepthIds];

  const SPIDER_LAIR_MONSTER_IDS = [
    'melvorTotH:ScouterSpider',
    'melvorTotH:TrapperSpider',
    'melvorTotH:WickedSpider',
    'melvorTotH:BasherSpider',
    'melvorTotH:EnforcerSpider',
    'melvorTotH:GuardianSpider',
  ];

  // Map strongholds boss IDs back to canonical monster IDs where identical
  const BOSS_CANONICAL_ID_MAP = {
    'melvorF:FierceDevilBoss': 'melvorF:FierceDevil',
    'melvorF:ElementalistBoss': 'melvorF:Elementalist',
    'melvorF:PratTheGuardianOfSecretsBoss': 'melvorF:PratTheGuardianOfSecrets',
  };

  function resolveAreaMonsters(areaId) {
    if (areaId === 'melvorTotH:Lair_of_the_Spider_Queen') {
      return SPIDER_LAIR_MONSTER_IDS.map(getMonsterDisplayName);
    }
    const area = rawAreasMap.get(areaId);
    if (!area) return [];
    const ids = (area.monsterIDs || []).map((id) => BOSS_CANONICAL_ID_MAP[id] || id);
    return [...new Set(ids.map(getMonsterDisplayName))];
  }

  function resolveStrongholdObject(shId) {
    const sh = rawAreasMap.get(shId);
    const ids = (sh.monsterIDs || []).map((id) => BOSS_CANONICAL_ID_MAP[id] || id);
    const monsters = [...new Set(ids.map(getMonsterDisplayName))];
    const tiers = {};
    for (const [tierName, tierData] of Object.entries(sh.tiers || {})) {
      let damageMultiplier = 1;
      for (const pid of tierData.passives || []) {
        const p = passivesMap.get(pid);
        if (p?.modifiers?.damageDealt !== undefined) {
          damageMultiplier = (100 + p.modifiers.damageDealt) / 100;
        }
      }
      tiers[tierName] = {
        damageMultiplier: Number(damageMultiplier.toFixed(4)),
        passives: tierData.passives || [],
      };
    }
    return {
      id: shId,
      name: getAreaDisplayName(shId),
      realm: sh.realm === 'melvorItA:Abyssal' ? 'Abyssal' : 'Melvor',
      overrideDamageType: 'melvorD:Pure',
      monsters,
      tiers,
    };
  }

  const combatAreaList = melvorCombatAreaIds.map((id) => ({
    id,
    name: getAreaDisplayName(id),
    realm: 'Melvor',
    monsters: resolveAreaMonsters(id),
  }));

  const slayerAreaList = melvorSlayerAreaIds.map((id) => ({
    id,
    name: getAreaDisplayName(id),
    realm: 'Melvor',
    monsters: resolveAreaMonsters(id),
  }));

  const dungeonList = melvorDungeonIds.map((id) => ({
    id,
    name: getAreaDisplayName(id),
    realm: 'Melvor',
    monsters: resolveAreaMonsters(id),
  }));

  const strongholdList = melvorStrongholdIds.map(resolveStrongholdObject);

  const abyssCombatAreaList = abyssCombatAreaIds.map((id) => ({
    id,
    name: getAreaDisplayName(id),
    realm: 'Abyssal',
    monsters: resolveAreaMonsters(id),
  }));

  const abyssSlayerAreaList = abyssSlayerAreaIds.map((id) => ({
    id,
    name: getAreaDisplayName(id),
    realm: 'Abyssal',
    monsters: resolveAreaMonsters(id),
  }));

  const abyssDungeonList = abyssDungeonIds.map((id) => ({
    id,
    name: getAreaDisplayName(id),
    realm: 'Abyssal',
    monsters: resolveAreaMonsters(id),
  }));

  const abyssStrongholdList = abyssStrongholdIds.map(resolveStrongholdObject);

  // Slayer Tiers (Melvor Realm: Easy -> Mythical)
  const melvorSlayerCategories = [
    ...pkgs.melvorF.data.slayerTaskCategories.map((c) => ({ ...c, ns: 'melvorF' })),
    ...pkgs.melvorTotH.data.slayerTaskCategories.map((c) => ({ ...c, ns: 'melvorTotH' })),
  ];
  const slayerTaskList = melvorSlayerCategories.map((cat) => {
    const min = cat.monsterSelection.minLevel;
    const max = cat.monsterSelection.maxLevel ?? Infinity;
    const monsters = [];
    for (const ns of ['melvorD', 'melvorF', 'melvorTotH', 'melvorAoD']) {
      for (const m of pkgs[ns].data.monsters || []) {
        const cl = calcCombatLevel(m);
        if (m.canSlayer && cl >= min && cl <= max) {
          monsters.push(getMonsterDisplayName(`${ns}:${m.id}`));
        }
      }
    }
    return {
      id: `${cat.ns}:${cat.id}`,
      name: cat.name,
      realm: 'Melvor',
      monsters,
    };
  });

  // Abyssal Slayer Tiers (Abyssal Realm: Woe -> Resolution)
  const abyssSlayerCategories = pkgs.melvorItA.data.slayerTaskCategories || [];
  const abyssSlayerTaskList = abyssSlayerCategories.map((cat) => {
    const depth = rawAreasMap.get(cat.monsterSelection.areaID);
    const uniqueIds = [...new Set(depth?.monsterIDs || [])];
    const monsters = uniqueIds
      .filter((id) => rawMonstersMap.get(id)?.canSlayer)
      .map(getMonsterDisplayName);
    return {
      id: `melvorItA:${cat.id}`,
      name: cat.name,
      realm: 'Abyssal',
      monsters,
    };
  });

  // Ignored monsters (random placeholders, multi-phase final bosses handled outside standard idle, duplicate boss clones)
  const IGNORED_MONSTER_IDS = new Set([
    'melvorF:RandomITM',
    'melvorTotH:RandomSpiderLair',
    'melvorF:MysteriousFigurePhase1',
    'melvorF:MysteriousFigurePhase2',
    'melvorF:Ahrenia',
    'melvorF:Bane',
    'melvorF:BaneInstrumentOfFear',
    'melvorTotH:TheHeraldPhase1',
    'melvorTotH:TheHeraldPhase2',
    'melvorTotH:TheHeraldPhase3',
    'melvorF:FierceDevilBoss',
    'melvorF:ElementalistBoss',
    'melvorF:PratTheGuardianOfSecretsBoss',
    'melvorF:MalcsTheGuardianOfStrongholds',
    'melvorItA:Starfang',
    'melvorItA:Voidmaw',
    'melvorItA:Celesterror',
  ]);

  const STYLE_MAP = {
    melee: 'Melee',
    ranged: 'Ranged',
    magic: 'Magic',
  };

  const DOT_EFFECT_KEYWORDS = [
    'Burn',
    'Bleed',
    'Poison',
    'DeadlyPoison',
    'Frostburn',
    'Laceration',
    'Voidburn',
    'Voidburst',
    'AbyssalCurse',
    'EldritchCurse',
    'Ablaze',
    'Toxin',
    'Blight',
  ];

  function classifyEffect(effectID) {
    if (!effectID) return { isStun: false, isSleep: false, isCrystal: false, dots: [] };
    const eff = effectsMap.get(effectID);
    const tpl = eff?.templateID || '';
    const isStun =
      effectID.endsWith(':Stun') ||
      effectID.endsWith(':Freeze') ||
      tpl.endsWith(':Stun') ||
      tpl.endsWith(':Freeze');
    const isSleep = effectID.endsWith(':Sleep') || tpl.endsWith(':Sleep');
    const isCrystal =
      effectID.endsWith(':Crystallize') ||
      effectID.endsWith(':CrystalSanction') ||
      effectID.endsWith(':CrystalSanction0') ||
      tpl.endsWith(':Crystallize');
    const dots = [];
    for (const kw of DOT_EFFECT_KEYWORDS) {
      if (effectID.includes(kw) || tpl.includes(kw)) {
        dots.push(kw);
      }
    }
    return { isStun, isSleep, isCrystal, dots };
  }

  // Build reverse lookup of areas per monster
  const allAreaCollections = [
    ...combatAreaList,
    ...slayerAreaList,
    ...dungeonList,
    ...strongholdList,
    ...abyssCombatAreaList,
    ...abyssSlayerAreaList,
    ...abyssDungeonList,
    ...abyssStrongholdList,
  ];

  // Collect all monsters and sort by combatLevel
  const validRawMonsters = [...rawMonstersMap.values()]
    .filter((m) => !IGNORED_MONSTER_IDS.has(m.fullId))
    .sort((a, b) => calcCombatLevel(a) - calcCombatLevel(b));

  const monsterMap = validRawMonsters.map((m) => {
    const fullId = m.fullId;
    const name = getMonsterDisplayName(fullId);
    const attackStyle = STYLE_MAP[m.attackType];
    const stats = m.equipmentStats || [];
    const getStat = (key) => stats.find((s) => s.key === key)?.value || 0;

    let attackLevel = 0;
    let attackBonus = 0;
    let spellMaxHit = undefined;

    if (attackStyle === 'Melee') {
      attackLevel = m.levels?.Strength || 1;
      attackBonus = getStat('meleeStrengthBonus');
    } else if (attackStyle === 'Ranged') {
      attackLevel = m.levels?.Ranged || 1;
      attackBonus = getStat('rangedStrengthBonus');
    } else if (attackStyle === 'Magic') {
      attackLevel = m.levels?.Magic || 1;
      attackBonus = getStat('magicDamageBonus');
      const spellId = m.spellSelection?.standard || m.selectedSpell;
      if (spellId && spellsMap.has(spellId)) {
        spellMaxHit = spellsMap.get(spellId).maxHit;
      }
    }

    const baseNormalMaxHit = computeBaseNormalMaxHit(m, spellsMap, 10);

    let canStun = false;
    let canSleep = false;
    let canCrystallize = false;
    let usesNormalHit = false;
    const dotSet = new Set();

    // Check passives for status effects & intimidation
    let intimidation = 0;
    for (const pid of m.passives || []) {
      const p = passivesMap.get(pid);
      if (!p) continue;
      if (p.playerModifiers?.flatResistance) {
        for (const fr of p.playerModifiers.flatResistance) {
          if (fr.value < 0) {
            intimidation += Math.abs(fr.value);
          }
        }
      }
      for (const ce of p.combatEffects || []) {
        const cls = classifyEffect(ce.effectID);
        if (cls.isCrystal) canCrystallize = true;
        cls.dots.forEach((d) => dotSet.add(d));
      }
    }

    const specialAttack = [];
    const sAttacks = m.specialAttacks || [];
    if (sAttacks.length === 0) {
      usesNormalHit = true;
    } else {
      let totalChance = 0;
      for (const sa of sAttacks) {
        const atkId = typeof sa === 'string' ? sa : sa.id;
        const atk = attacksMap.get(atkId);
        if (!atk) continue;
        const chance = typeof sa === 'object' && sa.chance !== undefined ? sa.chance : (atk.defaultChance || 0);
        totalChance += chance;

        for (const eff of [...(atk.onhitEffects || []), ...(atk.prehitEffects || [])]) {
          const cls = classifyEffect(eff.effectID);
          if (cls.isStun) canStun = true;
          if (cls.isSleep) canSleep = true;
          if (cls.isCrystal) canCrystallize = true;
          cls.dots.forEach((d) => dotSet.add(d));
        }

        const v = {
          name: getAttackDisplayName(atk),
        };

        const dmgArray = atk.damage || [];
        if (dmgArray.length === 0) {
          v.maxHit = 0;
          v.fixedAttack = true;
        } else if (atk.id === 'Confusion') {
          // Legacy compatibility for Wicked Greater Dragon's Confusion
          v.maxHitMultiplier = 75;
          v.fixedAttack = false;
        } else {
          const fixedTypes = ['Fixed', 'PoisonFixed100', 'BurnFixed100', 'CursedFixed100'];
          // Check if attack has special target HP scaling or crystallize scaling
          const targetHpDmg = dmgArray.find(
            (d) => d.character === 'Target' && (d.maxRoll === 'MaxHP' || d.maxRoll === 'CurrentHP' || d.maxRoll === 'CurrentHPCapped200')
          );
          const crystalDmg = dmgArray.find((d) => d.maxRoll === 'Crystallize');
          const defenceDmg = dmgArray.find((d) => d.character === 'Target' && d.maxRoll === 'DefenceLevel');

          const strongestSpecial = dmgArray.reduce((prev, curr) => {
            const pVal = prev.maxPercent !== undefined ? prev.maxPercent : (prev.amplitude || 0);
            const cVal = curr.maxPercent !== undefined ? curr.maxPercent : (curr.amplitude || 0);
            return pVal > cVal ? prev : curr;
          });
          const rawVal =
            strongestSpecial.maxPercent !== undefined
              ? strongestSpecial.maxPercent
              : (strongestSpecial.amplitude || 0);

          if (fixedTypes.includes(strongestSpecial.maxRoll)) {
            v.maxHit = rawVal;
            v.fixedAttack = true;
          } else {
            v.maxHitMultiplier = rawVal;
            v.fixedAttack = false;
            v.scaledMaxHit = Math.floor(baseNormalMaxHit * (rawVal / 100));
          }

          if (targetHpDmg) {
            v.targetHpPercent = targetHpDmg.maxPercent;
            v.targetHpRoll = targetHpDmg.maxRoll;
            const normalPart = dmgArray.find((d) => d.damageType === 'Normal');
            const fixedPart = dmgArray.find((d) => d.character === 'Attacker' && d.maxRoll === 'Fixed');
            const maxHitPart = dmgArray.find((d) => d.character === 'Attacker' && d.maxRoll === 'MaxHit');
            if (normalPart) v.includesNormalHit = true;
            if (fixedPart) v.bonusFixedHit = fixedPart.maxPercent;
            if (maxHitPart) v.bonusMaxHitMultiplier = maxHitPart.maxPercent;
          }
          if (crystalDmg) {
            v.crystallizeMultiplier = crystalDmg.maxPercent;
          }
          if (defenceDmg) {
            v.defenceLevelMultiplier = defenceDmg.maxPercent;
          }
        }

        specialAttack.push(v);
      }

      if (totalChance < 100) {
        usesNormalHit = true;
      }
    }

    // Areas list (excluding Lair of the Spider Queen spiders just like original, or including all standard areas)
    const areas = allAreaCollections
      .filter((a) => a.id !== 'melvorTotH:Lair_of_the_Spider_Queen' && !a.overrideDamageType && a.monsters.includes(name))
      .map((a) => a.name);

    const isStrongholdOnlyBoss = [
      'melvorF:MysteriousFigurePhase1Stronghold',
      'melvorF:MysteriousFigurePhase2Stronghold',
      'melvorF:AhreniaStronghold',
    ].includes(fullId);

    const damageType = isStrongholdOnlyBoss
      ? 'melvorD:Pure'
      : (m.damageType || 'melvorD:Normal');

    const realm =
      m.ns === 'melvorItA' && fullId !== 'melvorItA:MutatingPlant' && fullId !== 'melvorItA:MutatingChicken' && fullId !== 'melvorItA:MutatingCow' && fullId !== 'melvorItA:MutatingScarecrow'
        ? 'Abyssal'
        : 'Melvor';

    const res = {
      name,
      attackStyle,
      canStun,
      canSleep,
      canCrystallize,
      usesNormalHit,
      attackLevel,
      attackBonus,
    };
    if (spellMaxHit !== undefined) {
      res.spellMaxHit = spellMaxHit;
    }
    res.baseNormalMaxHit = baseNormalMaxHit;
    res.specialAttack = specialAttack;
    res.intimidation = intimidation;
    res.id = fullId;
    res.areas = areas;
    res.damageType = damageType;
    res.realm = realm;
    res.hasDoT = dotSet.size > 0;
    res.dots = [...dotSet];

    return res;
  });

  // Write output files to DataImportTools/Exported_Data/Exported_Data_TotH/
  const outDir = path.join(ROOT_DIR, 'DataImportTools', 'Exported_Data', 'Exported_Data_TotH');
  await fs.mkdir(outDir, { recursive: true });

  const serializeJsExport = (varName, data) => {
    const jsonStr = JSON.stringify(data).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `export const ${varName} = JSON.parse('${jsonStr}')\n`;
  };

  await fs.writeFile(path.join(outDir, 'monsterData.js'), serializeJsExport('monsterData', monsterMap), 'utf8');
  await fs.writeFile(path.join(outDir, 'combatAreaData.js'), serializeJsExport('combatAreaData', combatAreaList), 'utf8');
  await fs.writeFile(path.join(outDir, 'slayerAreaData.js'), serializeJsExport('slayerAreaData', slayerAreaList), 'utf8');
  await fs.writeFile(path.join(outDir, 'dungeonData.js'), serializeJsExport('dungeonData', dungeonList), 'utf8');
  await fs.writeFile(path.join(outDir, 'slayerTaskData.js'), serializeJsExport('slayerTaskData', slayerTaskList), 'utf8');
  await fs.writeFile(path.join(outDir, 'strongholdData.js'), serializeJsExport('strongholdData', strongholdList), 'utf8');
  await fs.writeFile(
    path.join(outDir, 'abyssalData.js'),
    [
      serializeJsExport('abyssCombatAreaData', abyssCombatAreaList),
      serializeJsExport('abyssSlayerAreaData', abyssSlayerAreaList),
      serializeJsExport('abyssDungeonData', abyssDungeonList),
      serializeJsExport('abyssStrongholdData', abyssStrongholdList),
      serializeJsExport('abyssSlayerTaskData', abyssSlayerTaskList),
    ].join(''),
    'utf8'
  );

  console.log(`[DONE] Generated v1.3.1 data in ${outDir}:`);
  console.log(`  - Monsters: ${monsterMap.length}`);
  console.log(`  - Melvor Combat Areas: ${combatAreaList.length}`);
  console.log(`  - Melvor Slayer Areas: ${slayerAreaList.length}`);
  console.log(`  - Melvor Dungeons: ${dungeonList.length}`);
  console.log(`  - Melvor Strongholds: ${strongholdList.length}`);
  console.log(`  - Melvor Slayer Tiers: ${slayerTaskList.length}`);
  console.log(`  - Abyssal Battlegrounds: ${abyssCombatAreaList.length}`);
  console.log(`  - Abyssal Slayer Areas: ${abyssSlayerAreaList.length}`);
  console.log(`  - Abyssal Dungeons/Depths: ${abyssDungeonList.length}`);
  console.log(`  - Abyssal Strongholds: ${abyssStrongholdList.length}`);
  console.log(`  - Abyssal Slayer Tiers: ${abyssSlayerTaskList.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
