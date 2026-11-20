import type { PlayerState, Rover } from '../shared/types';
import type { World } from '../shared/world';
import type { Renderer } from './render';
import type { targetingPhysics } from './targeting-physics';

type Vec3 = [number, number, number];
type ScreenPoint = [number, number];
type Target = Pick<Rover, 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz'>;

interface ShipTargeting {
  boxes: { at: ScreenPoint; width: number; height: number }[];
  lead?: ScreenPoint;
  aim?: ScreenPoint;
}

/** Intercept at constant target velocity. The ship's bolts do not inherit its velocity. */
export const intercept = (
  from: Vec3,
  at: Vec3,
  { vx, vy, vz }: Target,
  speed: number,
  range: number,
): Vec3 | undefined => {
  const [x, y, z] = [at[0] - from[0], at[1] - from[1], at[2] - from[2]];
  const distanceSq = x * x + y * y + z * z;
  const speedSq = speed ** 2 - (vx * vx + vy * vy + vz * vz);
  const dot = x * vx + y * vy + z * vz;
  const denominator = Math.sqrt(dot * dot + speedSq * distanceSq) - dot;
  const time = distanceSq / denominator;
  if (time > 0 && time <= range / speed) {
    return [at[0] + vx * time, at[1] + vy * time, at[2] + vz * time];
  }
};

const onScreen = (at?: ScreenPoint): at is ScreenPoint =>
  !!at && at[0] >= 0 && at[0] <= 1 && at[1] >= 0 && at[1] <= 1;

type Physics = typeof targetingPhysics;

interface View {
  world: World;
  camera: Vec3;
  yaw: number;
  aspect: number;
  project: Renderer['project'];
  hostile(id: number): boolean;
}

export const shipTargeting = (
  { world, camera, yaw, aspect, project, hostile }: View,
  ship: Rover,
  convergence: Vec3,
  rovers: Rover[],
  players: PlayerState[],
  { BOLT_SPEED, PLAYER_R, range, MODE, NOBODY, hidden, heightOf, muzzleOf }: Physics,
): ShipTargeting => {
  const aim = project(...convergence);
  const hud: ShipTargeting = { boxes: [], aim };
  const muzzle = muzzleOf(ship);
  const [dx, dy, dz] = convergence.map((v, i) => v - muzzle[i]);
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const [rightX, rightZ] = [Math.cos(yaw), -Math.sin(yaw)];
  const seam = world.def.seam;
  let best = Infinity;

  const add = (target: Target, y: number, halfWidth: number, halfHeight: number) => {
    const center: Vec3 = [target.x, y, target.z];
    const at = project(...center);
    if (!onScreen(at) || hidden(world, camera, center)) {
      return;
    }
    const side = project(center[0] + rightX, y, center[2] + rightZ) ?? at;
    const scale = 2 * Math.hypot((side[0] - at[0]) * aspect, side[1] - at[1]);
    hud.boxes.push({ at, width: (scale * halfWidth) / aspect, height: scale * halfHeight });

    const offset = aim ? Math.hypot((at[0] - aim[0]) * aspect, at[1] - aim[1]) : Infinity;
    if (offset >= best) {
      return;
    }
    const future = intercept(muzzle, center, target, BOLT_SPEED, range);
    if (!future || (seam !== undefined && future[1] > seam !== muzzle[1] > seam)) {
      return;
    }
    const lead = project(...future);
    if (!onScreen(lead) || hidden(world, muzzle, future)) {
      return;
    }

    // Compare the lead and the volley at the same depth to account for the offset chase camera.
    const along =
      ((future[0] - muzzle[0]) * dx + (future[1] - muzzle[1]) * dy + (future[2] - muzzle[2]) * dz) /
      lengthSq;
    if (along > 0) {
      best = offset;
      hud.lead = lead;
      hud.aim = project(muzzle[0] + along * dx, muzzle[1] + along * dy, muzzle[2] + along * dz);
    }
  };

  for (const rover of rovers) {
    const pilot = rover.driver === NOBODY ? rover.rider : rover.driver;
    if (rover !== ship && !rover.wreck && hostile(pilot)) {
      add(rover, rover.y, rover.ship ? 7 : 2.8, rover.ship ? 4 : 1.4);
    }
  }
  for (const player of players) {
    if (!player.down && player.mode !== MODE.RIDE && hostile(player.id)) {
      const halfHeight = heightOf(player) / 2;
      add(player, player.y + halfHeight, PLAYER_R, halfHeight);
    }
  }
  return hud;
};

/** The overlay is loaded only on maps with vehicles. */
export const createTargeting = (screen: HTMLElement, world: World, physics: Physics) => {
  const { PLAYER_R, MODE, NOBODY, aimOf, cylinder, heightOf, homeOf, ray, struck } = physics;
  screen.insertAdjacentHTML(
    'beforeend',
    '<style>' +
      'q{width:26px;height:26px;margin:-13px 0 0 -13px;border:2px solid #5f8;border-radius:50%;box-shadow:0 0 6px #3f6,inset 0 0 4px #3f6;background:radial-gradient(#afc 0 1.5px,#0000 2px)}q::before,q::after{content:none}' +
      '.targets{position:absolute;inset:0;pointer-events:none}' +
      '.target,.lead{position:absolute;transform:translate(-50%,-50%);box-sizing:border-box;border:2px solid #ff514d;box-shadow:0 0 3px #000}' +
      '.target{min-width:26px;min-height:26px;max-width:90%;max-height:90%}' +
      '.lead{width:18px;height:18px;border-radius:50%;border-style:dashed;background:radial-gradient(#ff514d 0 1px,transparent 2px)}' +
      '</style><span class="targets" aria-hidden="true" hidden><span class="lead" hidden></span></span>',
  );
  const overlay = screen.querySelector<HTMLElement>('.targets')!;
  const lead = overlay.querySelector<HTMLElement>('.lead')!;
  const boxes: HTMLElement[] = [];
  const place = (el: HTMLElement, [x, y]: ScreenPoint) => {
    el.style.left = `${x * 100}%`;
    el.style.top = `${y * 100}%`;
  };

  return {
    frame(
      car: Rover | undefined,
      { yaw, pitch }: Pick<Rover, 'yaw' | 'pitch'>,
      camera: Vec3,
      aspect: number,
      project: Renderer['project'],
      rovers: Rover[],
      players: PlayerState[],
      ownTeam: number,
      team: (id: number) => number | undefined,
    ): ScreenPoint | undefined {
      overlay.hidden = !car?.ship;
      if (!car) {
        return;
      }

      const hostile = (id: number) => {
        const side = team(id);
        return side !== undefined && side !== ownTeam;
      };
      const hulls = rovers.filter((r, i) => {
        const pilot = r.driver === NOBODY ? r.rider : r.driver;
        return (
          r !== car && !r.wreck && (!car.ship || (team(pilot) ?? homeOf(world, i)) !== ownTeam)
        );
      });
      const up = players.filter(
        p => !p.down && p.mode !== MODE.RIDE && (!car.ship || hostile(p.id)),
      );
      // Match the convergence used by the host for its salvo.
      const convergence = aimOf(car, yaw, pitch, (o, d, m) =>
        Math.min(
          ray(world, o, d, m),
          ...hulls.map(r => struck(r, o, d, m)),
          ...up.map(p => cylinder(o, d, p, PLAYER_R, heightOf(p))),
        ),
      );
      if (!car.ship) {
        return project(...convergence);
      }
      const {
        boxes: contacts,
        aim,
        lead: next,
      } = shipTargeting(
        { world, camera, yaw, aspect, project, hostile },
        car,
        convergence,
        hulls,
        up,
        physics,
      );
      for (let i = 0; i < contacts.length; i++) {
        const { at, width, height } = contacts[i];
        let el = boxes[i];
        if (!el) {
          el = boxes[i] = document.createElement('span');
          el.className = 'target';
          overlay.prepend(el);
        }
        el.hidden = false;
        place(el, at);
        el.style.width = `${width * 100}%`;
        el.style.height = `${height * 100}%`;
      }
      for (let i = contacts.length; i < boxes.length; i++) {
        boxes[i].hidden = true;
      }
      lead.hidden = !next;
      if (next) {
        place(lead, next);
      }
      return aim;
    },
  };
};
