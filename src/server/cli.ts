#!/usr/bin/env node
import { serve } from './index';

const port = Number(process.env.PORT) || 8787;
// MAP picks the map by its key (highline, tranquility); unset or unknown: highline.
serve({ port, rules: { map: process.env.MAP } });
console.log(`tiny-fps server on ws://localhost:${port}/<room>`);
