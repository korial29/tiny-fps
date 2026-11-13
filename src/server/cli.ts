#!/usr/bin/env node
import { serve } from './index';

const port = Number(process.env.PORT) || 8787;
// MAP picks the map by its key (highline, tranquility); unset or unknown: highline. BOTS fills
// each room with bots up to that many players while someone plays; unset: none.
// BOT_SKILL sets their skill, 0 to 7 (unset: 4).
const botSkill = process.env.BOT_SKILL ? Number(process.env.BOT_SKILL) : undefined;
serve({ port, rules: { map: process.env.MAP, bots: Number(process.env.BOTS) || 0, botSkill } });
console.log(`tiny-fps server on ws://localhost:${port}/<room>`);
