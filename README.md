# Can I Idle Melvor? (Melvor Idle v1.3.1 Combat Calculator)

A comprehensive web calculator to determine whether a player can safely idle combat areas, slayer areas, dungeons, strongholds, and slayer task tiers in **Melvor Idle v1.3.1**.

## Supported Game Versions & Expansions
This calculator is up to date as of **Melvor Idle v1.3.1** and supports:
- **Base Game (v1.3.1)**: All Combat Areas, Slayer Areas, Dungeons, Slayer Tiers (`Easy` through `Master`), and the 4 Base Game **Strongholds** (`Stronghold of the Undead`, `Stronghold of Magic`, `Stronghold of Dragons`, and `Stronghold of the Gods`).
- **Throne of the Herald (v1.1)**: All TotH Combat/Slayer Areas, Dungeons, and `Legendary` & `Mythical` Slayer Tiers.
- **Atlas of Discovery (v1.2)**: All AoD Combat Areas, Slayer Areas (`Crystal Caves`, `Dark Quarry`, `Crystal Depths`), Dungeons (`Golem Territory`, `Unholy Forest`, `Trickery Temple`, `Cult Grounds`, `Underwater City`), **Ancient Relics** game mode, Cartography's **Dark Waters POI**, and **Crystal Sanction / Crystallized** mechanics.
- **Into the Abyss (v1.3.1)**: Full **Abyssal Realm** support including Abyssal Battlegrounds, Abyssal Slayer Grounds, Abyssal Strongholds (`Stronghold of Blight`, `Stronghold of Fear`, `Stronghold of Nightmares`, `Stronghold of the Overlords`), Abyssal Dungeons & Depths (`Into the Abyss`, `Depths of Woe` through `The Final Depth`), and Abyssal Slayer Tiers (`Woe` through `Resolution`).

---

## Key Features & v1.3.1 Combat Mechanics

### 1. Melvor Realm & Abyssal Realm Switcher
Toggle seamlessly at the top of the page between:
- **Base Game + TotH + AoD (Melvor Realm)**: Uses standard **Damage Reduction (`DR%`)** and the standard Combat Triangle (`Melee -> Ranged -> Magic -> Melee`).
- **Into the Abyss (Abyssal Realm)**: Dynamically switches calculations and UI labels to **Abyssal Resistance (`AR%`)** and applies the **Reversed Combat Triangle** (`Melee -> Magic -> Ranged -> Melee`).

### 2. Three Damage Types (`damageType`)
- **Normal Damage (`melvorD:Normal`)**: Mitigated by Player `DR%`, scaled by the active Combat Triangle, minus Monster Intimidation.
- **Pure Damage (`melvorD:Pure`)**: Inflicted in **Strongholds** and by specific Stronghold bosses. Completely ignores Player `DR%` and `AR%`, scales enemy max hits by the selected Stronghold Tier modifier (`Standard`, `Augmented`, `Superior`), displays `"N/A (Pure)"` in the `DR% / AR% Needed` column, and computes `HP Needed` strictly from the tier-adjusted max hit and your Auto-Eat threshold.
- **Abyssal Damage (`melvorItA:Abyssal`)**: Ignores standard `DR%` and is mitigated strictly by Player **Abyssal Resistance (`AR%`)** (scaled by the Reversed Combat Triangle), minus Monster Abyssal Intimidation.

### 3. Strongholds Tab & Tier Selector
- Dedicated **Strongholds** tab (plus an Overview summary table) supporting both Melvor Realm and Abyssal Realm Strongholds across all three tiers:
  - `Standard`
  - `Augmented`
  - `Superior`

### 4. Special Dungeons & Events Tab (Formerly Banned Dungeons)
- Dedicated **Special** tab (plus an Overview summary table) supporting high-tier encounters previously excluded from idle calculators due to active mechanics:
  - **Into the Mist** (`melvorF:Into_the_Mist`): Evaluates survival against `Mysterious Figure - Phase 1`, `Mysterious Figure - Phase 2`, and `Ahrenia`.
  - **Impending Darkness Event** (`melvorF:Impending_Darkness`): Evaluates survival against `Bane` and `Bane, Instrument of Fear`, accounting for Bane's *Random* attack style by applying worst-case Combat Triangle protection.
  - **Throne of the Herald** (`melvorTotH:Throne_of_the_Herald`): Evaluates survival against `The Herald Phase 1`, `The Herald Phase 2`, and `The Herald (Phase 3)` with 44 Intimidation.
  - **The Abyss - Depth 9 (???)** (`melvorItA:Depth9`): Evaluates survival against secret superbosses `Starfang`, `Voidmaw`, and `Celesterror`.
- Features encounter-specific disclaimers explaining `pauseOnBosses: true`, multi-style phasing, and interactive draft modifiers.

### 5. Updated Auto-Eat & Status Modifiers
- **Base Auto-Eat Thresholds**: Tier 1 (`20%`), Tier 2 (`30%`), Tier 3 (`40%`).
- **Wasteful Ring**: `+5%` Auto-Eat threshold.
- **Cartography Dark Waters POI (v1.2 AoD)**: Configurable as `None (0%)`, `Active (+5%)`, or `Doubled (+10%)` Auto-Eat threshold.
- **Crystal Sanction Immunity (v1.2 AoD)**: Toggle to negate the `1.3x` Crystal Sanction / Crystallized damage multiplier (and doubled `Crystal Pierce` damage) when wearing `(C)` Crystal Sanction protection gear.
- **Ancient Relics Mode**: Uses Hardcore Combat Triangle modifiers with standard `10x` HP/damage scaling.
- **Backwards-Compatible Shareable Links**: Copy your full configuration to the clipboard via URL query parameters; legacy v1.1 shareable links continue to load cleanly with sensible defaults.

---

## Updating Game Data (`scripts/build-data.mjs`)

Monster, attack, area, dungeon, stronghold, and slayer task data are extracted directly from the official Melvor Idle CDN JSON packages (`melvorDemo.json`, `melvorFull.json`, `melvorTotH.json`, `melvorExpansion2.json`, `melvorItA.json`, and `lang/en.json`).

To refresh the dataset for future Melvor Idle patches:

```bash
node scripts/build-data.mjs
```

This script fetches the latest official JSON data, computes base normal attack max hits via Melvor's `Enemy.updateMaxHit()` formula, resolves special attacks, status flags (`Stun`, `Freeze`, `Sleep`, `CrystalSanction`, `Crystallize`, and DoTs), and intimidation passives, and writes the updated ES module data files into `DataImportTools/Exported_Data/Exported_Data_TotH/`.

---

## Credits & Attribution

This repository ([`BrushWild/CanIIdle`](https://github.com/BrushWild/CanIIdle)) is a fork of [`zxv975/CanIIdle`](https://github.com/zxv975/CanIIdle) and continues a long-standing Melvor Idle community project:
- **[Can I Idle This?](https://drboomtown.github.io/)** — Originally created by **Dr BoomTown**
- **[Can I Idle This?](https://sublimedisciple.github.io/idle-slayer.html)** — Further developed by **Sublimed Disciple**
- **[Can I Idle Melvor?](https://silberdrachi.github.io/CanIIdle/)** — Updated and modernised by **Silberdrachi**
- **[Can I Idle Throne of the Herald? (`zxv975/CanIIdle`)](https://github.com/zxv975/CanIIdle)** — Updated for the *Throne of the Herald* (v1.1) expansion by **Zxv**

*"Melvor Idle" is a trademark of Games by Malcs Pty Ltd and is used with the permission of Games by Malcs.*

---

## AI Assistance Disclosure

The upgrade to **Melvor Idle v1.3.1**—including Base Game Strongholds, *Atlas of Discovery* (v1.2), and *Into the Abyss* (v1.3.1) support, the automated CDN data extraction pipeline (`scripts/build-data.mjs`), and the combat calculation engine and UI refactoring—was developed with the assistance of AI coding tools.
