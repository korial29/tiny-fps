#!/usr/bin/env node
import { serve } from './index';

const port = Number(process.env.PORT) || 8787;
serve({ port });
console.log(`tiny-fps server on ws://localhost:${port}/<room>`);
