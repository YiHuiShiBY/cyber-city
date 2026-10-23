import * as THREE from 'three';
import { makeMarketLife } from './district-market-life.js';
import { makeCrossingLife } from './district-crossing-life.js';
import { makeStationLife } from './district-station-life.js';

/** Assign existing citizens once; the activity modules never grow the crowd roster. */
export function makeDistrictLife({ streets, landmarks, riders, robots, buses, buildings, reserved = [] }) {
  const group = new THREE.Group(); group.name = 'DistrictLife';
  const people = streets.userData.people, assigned = new Set();
  function claim(count, x, z, activityId) {
    const candidates = people.map((person, index) => ({ person, index }))
      .filter(({ person, index }) => !assigned.has(index) && !person.umbrella && !person.walking)
      .sort((a, b) => Math.hypot(a.person._px - x, a.person._pz - z) - Math.hypot(b.person._px - x, b.person._pz - z));
    if (candidates.length < count) throw new Error(`Insufficient existing citizens for ${activityId}`);
    return candidates.slice(0, count).map(({ person, index }) => {
      assigned.add(index); person.activityId = activityId; return index;
    });
  }
  const activities = {
    market: makeMarketLife({ people, actorIndices: claim(14, -52, 69.2, 'market'), buildings, reserved }),
    crossing: makeCrossingLife({ people, actorIndices: claim(12, 42, 4.35, 'crossing'), traffic: { streets, riders, robots, buses } }),
    station: makeStationLife({ landmarks, people, actorIndices: claim(8, 21, 27, 'station') }),
  };
  const owners = new Map();
  for (const [id, activity] of Object.entries(activities)) {
    group.add(activity);
    for (const index of activity.userData.actorIndices) owners.set(index, activity);
    activity.userData.activityId = id;
  }
  const samplePerson = (index, seconds) => owners.get(index)?.userData.samplePerson(index, seconds) || null;
  streets.userData.setActivitySampler(samplePerson);
  function update(seconds) { for (const activity of Object.values(activities)) activity.userData.update(seconds); }
  group.userData = {
    activities, actorIndices: [...assigned], samplePerson, update,
    prepareView(camera) { for (const activity of Object.values(activities)) activity.userData.prepareView?.(camera); },
  };
  update(0); streets.userData.update(0);
  return group;
}
