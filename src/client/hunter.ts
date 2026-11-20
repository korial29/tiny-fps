// Hunter design study. Parts share the runner's metre scale, -z facing and mesh vertex format.
import { SHINE, STRIDE, TWILL, WEAVE, capsule, dress, segment, solid, sub, unit } from './mesh';
import type { Vec3 } from './mesh';

const hide: Vec3 = [0.39, 0.42, 0.28];
const leather: Vec3 = [0.15, 0.12, 0.105];
const graphite: Vec3 = [0.18, 0.22, 0.23];
const silver: Vec3 = [0.57, 0.66, 0.66];
const bronze: Vec3 = [0.59, 0.37, 0.19];
const light: Vec3 = [1, 0.24, 0.065];

export function hunter(lod: 0 | 1 | 2) {
  const parts: Record<string, number[]> = {};
  let out: number[];
  const part = (name: string) => { out = parts[name] = []; };
  function limb(a: Vec3, b: Vec3, radii: number[], color: Vec3, depth = 1, layer = -1, rounded = false) {
    const start = out.length;
    const length = Math.hypot(...sub(b, a));
    const side: Vec3 = Math.abs(b[0] - a[0]) > length * 0.9 ? [0, 1, 0] : [1, 0, 0];
    const rings = rounded ? (lod === 2 ? 6 : 3) : 0;
    const profile = radii.flatMap((radius, i) => {
      if (i === radii.length - 1 || lod === 0) return [radius];
      const mid = (radius + radii[i + 1]) / 2;
      const bend = (radius + radii[i + 1] - radii[Math.max(0, i - 1)]
        - radii[Math.min(radii.length - 1, i + 2)]) / 16;
      return [radius, mid + bend];
    });
    const mesh = lod === 0 ? solid(0, length, radii, rounded ? [1, 1] : [0, 0])
      : dress(capsule(length, profile, lod === 2 ? 24 : 12, [rings, rings]), [1, 1, 1]);
    segment(out, mesh, a, b, side, length, [1, depth], color);
    for (let i = start + 8; i < out.length; i += STRIDE) out[i] = layer;
  }
  // Round the outline with a quadratic Bezier at each corner, then loft the shell
  // through shrinking copies of the outline to the crown. Shared normals cross each seam.
  function plate(edge: Vec3[], peak: Vec3, color: Vec3, layer = TWILL, sharp = false) {
    const outline: Vec3[] = [];
    const corners = [1, 3, 6][lod];
    const blend = sharp ? 0.05 : 0.34;
    const area = edge.reduce((sum, p, i) => {
      const q = edge[(i + 1) % edge.length];
      return sum + p[0] * q[1] - p[1] * q[0];
    }, 0);
    if (area > 0) edge.reverse();
    edge.forEach((p, i) => {
      const prev = edge[(i + edge.length - 1) % edge.length];
      const next = edge[(i + 1) % edge.length];
      for (let j = 0; j <= corners; j++) {
        const t = j / corners;
        outline.push(p.map((v, k) => v + blend * ((1 - t) ** 2 * (prev[k] - v)
          + t ** 2 * (next[k] - v))) as Vec3);
      }
    });
    const steps = [2, 4, 7][lod];
    const points: Vec3[] = [];
    const faces: number[][] = [];
    const count = outline.length;
    for (let row = 0; row < steps; row++) {
      const angle = Math.PI * row / (2 * steps);
      const width = sharp ? 1 - row / steps : Math.cos(angle);
      const height = sharp ? row / steps : Math.sin(angle);
      outline.forEach((q, i) => {
        points.push([peak[0] + width * (q[0] - peak[0]),
          peak[1] + width * (q[1] - peak[1]), q[2] + height * (peak[2] - q[2])]);
        const a = row * count + i, b = row * count + (i + 1) % count;
        if (row === steps - 1) faces.push([a, b, steps * count]);
        else faces.push([a, b, b + count], [a, b + count, a + count]);
      });
    }
    points.push(peak);
    const normals: Vec3[] = points.map(() => [0, 0, 0]);
    function normal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
      const u = sub(b, a), v = sub(c, a);
      return [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    }
    const vertex = (p: Vec3, n: Vec3) => out.push(...p, ...n, color[0], color[1], layer, color[2]);
    for (const [a,b,c] of faces) {
      const n = normal(points[a], points[b], points[c]);
      for (const i of [a,b,c]) for (let k = 0; k < 3; k++) normals[i][k] += n[k];
    }
    const smooth = normals.map(unit);
    for (const face of faces) for (const i of face) vertex(points[i], smooth[i]);
    const back: Vec3 = [peak[0], peak[1], Math.max(...edge.map(p => p[2])) + 0.014];
    outline.forEach((a,i) => {
      const b = outline[(i + 1) % count], n = unit(normal(b, a, back));
      for (const p of [b,a,back]) vertex(p,n);
    });
  }

  part('Body');
  limb([0,0.91,0],[0,1.52,0],[0.14,0.215,0.15,0.25,0.265,0.15],hide,0.71);
  limb([0,1.46,0],[0,1.68,0],[0.145,0.095,0.105],graphite,0.9);
  limb([0,1.59,0],[0,1.86,0.01],[0.084,0.128,0.15,0.13,0.058],graphite,1);
  for(const s of [-1,1]) {
    part('Leg'+s);
    const hip: Vec3=[s*0.11,0.97,0], knee: Vec3=[s*0.155,0.53,-0.034], ankle: Vec3=[s*0.185,0.12,0.025];
    limb(hip,knee,[0.1,0.118,0.106,0.076],hide,1.08,-1,true);
    limb(knee,ankle,[0.073,0.09,0.084,0.05],leather,1);
    limb([s*0.18,0.22,0.016],ankle,[0.069,0.077,0.064],graphite);
    limb([s*0.185,0.075,0.075],[s*0.188,0.067,-0.152],[0.053,0.076,0.082,0.045],graphite,0.81);
    for(let j=0;j<3;j++) {
      const x=s*(0.153+j*0.008), y=0.51-j*0.107;
      plate([[x-0.059,y+0.047,-0.088],[x+0.062,y+0.047,-0.085],[x+0.045,y-0.05,-0.089],[x,y-0.09,-0.10],[x-0.05,y-0.048,-0.086]],[x,y,-0.135],j===0?bronze:graphite);
    }
    limb([s*0.125,0.815,0],[s*0.137,0.765,-0.007],[0.121,0.117],leather,1.07);
    part('Arm'+s);
    const shoulder: Vec3=[s*0.235,1.47,0], elbow: Vec3=[s*0.35,1.185,0.012], wrist: Vec3=[s*0.39,0.995,-0.115];
    limb(shoulder,elbow,[0.094,0.113,0.09,0.065],hide,0.98,-1,true);
    limb(elbow,wrist,[0.069,0.087,0.064,0.05],graphite,1, TWILL,true);
    limb(wrist,[s*0.397,0.898,-0.139],[0.05,0.056,0.038],hide,0.81,-1,true);
    for(let j=0;j<(lod?4:2);j++){
      const x=s*(0.365+j*(lod?0.019:0.043));
      limb([x,0.922,-0.147],[x,0.855+Math.abs(1-j)*0.008,-0.17],[0.014,0.013,0.006],leather);
    }
    part('Mantle'+s);
    for(let j=0;j<3;j++) {
      const x=s*(0.238+j*0.024), y=1.503-j*0.035;
      limb([x,y-0.045,0],[x,y+0.041,0],[0.102-j*0.012,0.113-j*0.012,0.065],j===0?bronze:graphite,1.22,TWILL);
    }
    part('Breastplate'+s);
    plate([[s*0.009,1.473,-0.184],[s*0.17,1.506,-0.09],[s*0.258,1.435,-0.05],[s*0.19,1.334,-0.123],[s*0.026,1.312,-0.184]],[s*0.104,1.407,-0.226],graphite);
    for(let j=0;j<3;j++){
      const y=1.295-j*0.062;
      plate([[s*0.012,y,-0.135],[s*(0.192-j*0.014),y+0.043,-0.085],[s*0.152,y-0.02,-0.098],[s*0.017,y-0.038,-0.135]],[s*0.086,y,-0.157],j===0?bronze:graphite);
    }
    part('Faceplate'+s);
    plate([[0,1.855,-0.065],[s*0.095,1.839,-0.072],[s*0.145,1.797,-0.045],[s*0.137,1.758,-0.10],[s*0.039,1.732,-0.167],[0,1.701,-0.176]],[s*0.051,1.807,-0.187],silver);
    plate([[s*0.129,1.744,-0.104],[s*0.104,1.689,-0.121],[s*0.052,1.625,-0.118],[s*0.014,1.672,-0.175],[s*0.041,1.718,-0.168]],[s*0.087,1.704,-0.16],silver);
    limb([s*0.036,1.724,-0.165],[s*0.12,1.751,-0.115],[0.006,0.008,0.003],light,1,-2);
    part('Quills'+s);
    const count=[3,5,7][lod];
    for(let j=0;j<count;j++){
      const t=j/(count-1), x=s*(0.13-0.104*t);
      const a:Vec3=[x,1.784,0.009+0.123*t], b:Vec3=[s*(0.182-0.117*t),1.635,0.073+0.111*t];
      const c:Vec3=[s*(0.205-0.134*t),1.50-0.127*t,0.128+0.135*t];
      limb(a,b,[0.018,0.024,0.019],leather);
      const tip: Vec3 = [c[0]-s*0.018, c[1]-0.055-0.026*t, c[2]+0.027];
      limb(b,c,[0.02,0.019,0.014],graphite);
      limb(c,tip,[0.014,0.009,0.002],graphite);
      limb(b,[b[0],b[1]-0.018,b[2]+0.005],[0.022,0.021],bronze,1,SHINE);
    }
  }
  part('Harpoon harness');
  limb([-0.15,1.05,0.118],[0.155,1.487,0.131],[0.045,0.045],leather,0.64,WEAVE);
  for (const y of [1.17,1.41]) {
    const x = (y-1.07)*0.485;
    limb([x-0.079,y,0.128],[x+0.019,y+0.049,0.164],[0.032,0.038,0.031],graphite,1,TWILL);
  }
  for (const s of [-1,1]) {
    part('Greave and gauntlet details'+s);
    for (let j=0;j<3;j++) {
      const y=1.151-j*0.046, x=s*(0.358+j*0.01), z=-0.01-j*0.026;
      limb([x,y,z],[x+s*0.004,y-0.019,z-0.011],[0.084-j*0.005,0.079-j*0.005],j===1?bronze:graphite,1,TWILL);
    }
    const x=s*0.14;
    plate([[x-0.075,0.842,-0.08],[x+0.065,0.844,-0.087],[x+0.07,0.73,-0.098],[x+0.01,0.63,-0.123],[x-0.057,0.687,-0.112]],[x,0.764,-0.158],graphite);
    if(lod) for(let j=0;j<3;j++) {
      const y=0.785-j*0.03;
      limb([x-0.032,y,-0.149],[x+0.028,y+0.022,-0.141],[0.004,0.005],bronze);
    }
    part('Collar'+s);
    limb([s*0.061,1.533,-0.08],[s*0.172,1.48,-0.116],[0.024,0.028,0.024],bronze,0.76,TWILL);
  }
  part('Visor bridge');
  plate([[-0.034,1.713,-0.155],[0,1.732,-0.17],[0.034,1.713,-0.155],[0.022,1.642,-0.139],[0,1.618,-0.12],[-0.022,1.642,-0.139]],[0,1.685,-0.182],graphite);
  part('Helmet crown');
  plate([[-0.141,1.77,-0.046],[-0.143,1.817,-0.033],[-0.11,1.861,-0.027],
    [-0.054,1.883,-0.025],[0.054,1.883,-0.025],[0.11,1.861,-0.027],
    [0.143,1.817,-0.033],[0.141,1.77,-0.046],[0.09,1.793,-0.146],
    [0,1.761,-0.18],[-0.09,1.793,-0.146]],[0,1.819,-0.191],silver);
  part('Rangefinder');
  limb([-0.232,1.704,-0.042],[-0.23,1.705,-0.138],[0.018,0.025,0.02],bronze,1,TWILL);
  limb([-0.23,1.705,-0.138],[-0.23,1.705,-0.14],[0.012,0.012],light,1,-2);
  part('Belt');
  limb([0,0.973,0],[0,1.045,0],[0.207,0.215,0.198],leather,0.79,WEAVE);
  plate([[-0.071,1.028,-0.162],[0.071,1.028,-0.162],[0.084,0.924,-0.164],[0.018,0.753,-0.18],[-0.069,0.854,-0.173]],[0,0.918,-0.192],bronze);
  part('Wrist blade');
  plate([[0.355,1.026,-0.177],[0.405,1.051,-0.172],[0.434,0.973,-0.185],[0.415,0.685,-0.276],[0.376,0.934,-0.215]],[0.398,0.949,-0.229],silver,SHINE,true);
  part('Shoulder laser');
  limb([-0.245,1.46,0.08],[-0.28,1.676,0.066],[0.064,0.042,0.059],bronze,1,TWILL);
  limb([-0.28,1.676,0.156],[-0.28,1.676,-0.164],[0.045,0.067,0.069,0.049,0.052],graphite,0.9,TWILL);
  limb([-0.28,1.676,-0.162],[-0.28,1.676,-0.174],[0.05,0.046],silver,0.92,SHINE);
  limb([-0.28,1.676,-0.175],[-0.28,1.676,-0.177],[0.028,0.028],light,1,-2);
  part('Harpoon');
  limb([-0.34,0.367,0.108],[0.367,1.823,0.183],[0.015,0.019,0.016],bronze,1,SHINE);
  plate([[0.342,1.817,0.166],[0.359,1.885,0.16],[0.45,1.985,0.17],[0.413,1.839,0.156],[0.382,1.844,0.157],[0.372,1.798,0.16]],[0.382,1.857,0.143],silver,SHINE,true);
  part('Flying disc');
  const hub:Vec3=[-0.206,0.961,-0.163];
  const diskPoint=(r:number,a:number,z:number):Vec3 => [hub[0]+r*Math.cos(a)*0.85,hub[1]+r*Math.sin(a),hub[2]+r*Math.cos(a)*0.5+z];
  for(let j=0;j<6;j++){
    const a=j*Math.PI/3;
    plate([diskPoint(0.054,a-0.32,0),diskPoint(0.109,a-0.41,0),diskPoint(0.139,a+0.27,0),diskPoint(0.089,a+0.22,0),diskPoint(0.054,a+0.66,0)],diskPoint(0.083,a,-0.019),silver,SHINE);
  }
  limb(hub,[hub[0]+0.013,hub[1],hub[2]-0.026],[0.075,0.061,0.034],bronze,1,TWILL);
  return parts;
}
