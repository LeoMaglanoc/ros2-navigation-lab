//! One deterministic navigation engine, two adapters: WebAssembly and native ROS 2.
//! World coordinates are metres, +x right and +y up. No ROS or browser dependencies.
use serde::Serialize;
use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::sync::Mutex;

pub const WIDTH: usize = 30;
pub const HEIGHT: usize = 20;
pub const RESOLUTION: f64 = 0.4;
pub const RADIUS: f64 = 0.18;
pub const MARGIN: f64 = 0.03;
pub const SPEED: f64 = 0.9;
pub const TURN_RATE: f64 = 3.0;
pub const DT: f64 = 0.02;

#[derive(Clone, Serialize)]
pub struct Grid {
    pub width: usize,
    pub height: usize,
    pub resolution: f64,
    pub occupied: Vec<bool>,
    pub blocked: Vec<bool>,
}
impl Grid {
    pub fn demo() -> Self {
        let mut occupied = vec![false; WIDTH * HEIGHT];
        for y in 0..HEIGHT {
            for x in 0..WIDTH {
                occupied[y * WIDTH + x] = x == 0
                    || y == 0
                    || x == WIDTH - 1
                    || y == HEIGHT - 1
                    || ((9..=10).contains(&x) && (4..=12).contains(&y))
                    || ((15..=20).contains(&x) && (10..=11).contains(&y))
                    || ((3..=5).contains(&x) && (12..=15).contains(&y))
                    || ((18..=20).contains(&x) && (3..=5).contains(&y))
                    || ((24..=28).contains(&x)
                        && (13..=17).contains(&y)
                        && (x == 24 || x == 28 || y == 13 || y == 17));
            }
        }
        let mut map = Self {
            width: WIDTH,
            height: HEIGHT,
            resolution: RESOLUTION,
            blocked: occupied.clone(),
            occupied,
        };
        // Inflate using Euclidean distance from a cell centre to every occupied cell box.
        for y in 0..HEIGHT {
            for x in 0..WIDTH {
                map.blocked[y * WIDTH + x] =
                    map.clearance(map.center(y * WIDTH + x)) <= RADIUS + MARGIN;
            }
        }
        map
    }
    pub fn center(&self, id: usize) -> [f64; 2] {
        [
            ((id % self.width) as f64 + 0.5) * self.resolution,
            ((id / self.width) as f64 + 0.5) * self.resolution,
        ]
    }
    pub fn cell(&self, x: f64, y: f64) -> Option<usize> {
        if !x.is_finite()
            || !y.is_finite()
            || x < 0.0
            || y < 0.0
            || x >= self.width as f64 * self.resolution
            || y >= self.height as f64 * self.resolution
        {
            return None;
        }
        Some(
            (y / self.resolution).floor() as usize * self.width
                + (x / self.resolution).floor() as usize,
        )
    }
    pub fn clearance(&self, point: [f64; 2]) -> f64 {
        self.occupied
            .iter()
            .enumerate()
            .filter(|(_, b)| **b)
            .map(|(id, _)| {
                let left = (id % self.width) as f64 * self.resolution;
                let bottom = (id / self.width) as f64 * self.resolution;
                let dx = (left - point[0])
                    .max(0.0)
                    .max(point[0] - left - self.resolution);
                let dy = (bottom - point[1])
                    .max(0.0)
                    .max(point[1] - bottom - self.resolution);
                dx.hypot(dy)
            })
            .fold(f64::INFINITY, f64::min)
    }
    pub fn neighbors(&self, id: usize) -> impl Iterator<Item = usize> + '_ {
        let x = id % self.width;
        let y = id / self.width;
        [
            if x > 0 { Some(id - 1) } else { None },
            if x + 1 < self.width {
                Some(id + 1)
            } else {
                None
            },
            if y > 0 { Some(id - self.width) } else { None },
            if y + 1 < self.height {
                Some(id + self.width)
            } else {
                None
            },
        ]
        .into_iter()
        .flatten()
        .filter(|&n| !self.blocked[n])
    }
    /// Four-connected A*, uniform unit edge costs, consistent Manhattan heuristic.
    pub fn plan(&self, start: usize, goal: usize) -> Option<(Vec<usize>, usize)> {
        if start >= self.blocked.len()
            || goal >= self.blocked.len()
            || self.blocked[start]
            || self.blocked[goal]
        {
            return None;
        }
        let heuristic = |id: usize| {
            (id % self.width).abs_diff(goal % self.width)
                + (id / self.width).abs_diff(goal / self.width)
        };
        let mut open = BinaryHeap::new();
        let mut costs = vec![usize::MAX; self.blocked.len()];
        let mut parent = vec![usize::MAX; self.blocked.len()];
        let mut expanded = 0;
        costs[start] = 0;
        open.push(Reverse((heuristic(start), 0, start)));
        while let Some(Reverse((_, cost, current))) = open.pop() {
            if cost != costs[current] {
                continue;
            }
            expanded += 1;
            if current == goal {
                let mut path = vec![current];
                while *path.last().unwrap() != start {
                    path.push(parent[*path.last().unwrap()]);
                }
                path.reverse();
                return Some((path, expanded));
            }
            for next in self.neighbors(current) {
                if cost + 1 < costs[next] {
                    costs[next] = cost + 1;
                    parent[next] = current;
                    open.push(Reverse((cost + 1 + heuristic(next), cost + 1, next)));
                }
            }
        }
        None
    }
}

#[derive(Clone, Serialize)]
pub struct Engine {
    pub map: Grid,
    pub radius: f64,
    pub pose: [f64; 3],
    pub velocity: [f64; 2],
    pub goal: Option<[f64; 2]>,
    pub goal_id: u32,
    pub path: Vec<[f64; 2]>,
    pub waypoint: usize,
    pub state: &'static str,
    pub paused: bool,
    pub expanded: usize,
    pub path_length: f64,
    pub distance_travelled: f64,
    pub ticks: u64,
}
impl Default for Engine {
    fn default() -> Self {
        Self {
            map: Grid::demo(),
            radius: RADIUS,
            pose: [1.4, 1.4, 0.0],
            velocity: [0.0; 2],
            goal: None,
            goal_id: 0,
            path: vec![],
            waypoint: 0,
            state: "idle",
            paused: false,
            expanded: 0,
            path_length: 0.0,
            distance_travelled: 0.0,
            ticks: 0,
        }
    }
}
impl Engine {
    /// 0 accepted, 1 outside/nonfinite, 2 occupied/insufficient clearance, 3 unreachable.
    /// Rejected requests leave the active goal, path, and motion untouched.
    pub fn set_goal(&mut self, x: f64, y: f64) -> u32 {
        let Some(goal) = self.map.cell(x, y) else {
            return 1;
        };
        if self.map.blocked[goal] {
            return 2;
        }
        let start = self
            .map
            .cell(self.pose[0], self.pose[1])
            .expect("robot stays on map");
        let Some((path, expanded)) = self.map.plan(start, goal) else {
            return 3;
        };
        self.path = path.into_iter().map(|id| self.map.center(id)).collect();
        self.goal = Some(self.map.center(goal));
        self.goal_id += 1;
        self.expanded = expanded;
        self.waypoint = 0;
        self.velocity = [0.0; 2];
        self.path_length = self
            .path
            .windows(2)
            .map(|w| (w[1][0] - w[0][0]).hypot(w[1][1] - w[0][1]))
            .sum::<f64>()
            + (self.path[0][0] - self.pose[0]).hypot(self.path[0][1] - self.pose[1]);
        self.state = "moving";
        0
    }
    pub fn cancel(&mut self) {
        self.path.clear();
        self.goal = None;
        self.waypoint = 0;
        self.state = "canceled";
        self.velocity = [0.0; 2];
    }
    pub fn tick(&mut self) {
        self.ticks += 1;
        self.velocity = [0.0; 2];
        if self.paused || self.state != "moving" {
            return;
        }
        while self.waypoint < self.path.len() {
            let target = self.path[self.waypoint];
            let dx = target[0] - self.pose[0];
            let dy = target[1] - self.pose[1];
            let distance = dx.hypot(dy);
            if distance < 1e-9 {
                self.waypoint += 1;
                continue;
            }
            let heading = dy.atan2(dx);
            let error = (heading - self.pose[2])
                .sin()
                .atan2((heading - self.pose[2]).cos());
            if error.abs() > 1e-9 {
                let turn = error.clamp(-TURN_RATE * DT, TURN_RATE * DT);
                self.pose[2] += turn;
                self.pose[2] = self.pose[2].sin().atan2(self.pose[2].cos());
                self.velocity[1] = turn / DT;
                return;
            }
            // No corner cutting: rotate in place, then traverse a cardinal segment.
            let step = distance.min(SPEED * DT);
            self.pose[0] += dx / distance * step;
            self.pose[1] += dy / distance * step;
            self.distance_travelled += step;
            self.velocity[0] = step / DT;
            return;
        }
        self.state = "arrived";
    }
    pub fn remaining(&self) -> f64 {
        if self.waypoint >= self.path.len() {
            return 0.0;
        }
        (self.path[self.waypoint][0] - self.pose[0])
            .hypot(self.path[self.waypoint][1] - self.pose[1])
            + self.path[self.waypoint..]
                .windows(2)
                .map(|w| (w[1][0] - w[0][0]).hypot(w[1][1] - w[0][1]))
                .sum::<f64>()
    }
}

// Small scalar-only ABI avoids a JS binding generator and Rust-specific struct layouts.
// Serialized access only. snapshot pointer is valid until the next nav_snapshot call.
static ENGINE: Mutex<Option<Engine>> = Mutex::new(None);
static SNAPSHOT: Mutex<Vec<u8>> = Mutex::new(Vec::new());
fn with_engine<T>(f: impl FnOnce(&mut Engine) -> T) -> T {
    let mut guard = ENGINE.lock().unwrap();
    f(guard.get_or_insert_with(Engine::default))
}
#[unsafe(no_mangle)]
pub extern "C" fn nav_reset() {
    with_engine(|e| *e = Engine::default());
}
#[unsafe(no_mangle)]
pub extern "C" fn nav_goal(x: f64, y: f64) -> u32 {
    with_engine(|e| e.set_goal(x, y))
}
#[unsafe(no_mangle)]
pub extern "C" fn nav_tick() {
    with_engine(Engine::tick);
}
#[unsafe(no_mangle)]
pub extern "C" fn nav_pause(value: u32) {
    with_engine(|e| {
        e.paused = value != 0;
        e.velocity = [0.0; 2];
    });
}
#[unsafe(no_mangle)]
pub extern "C" fn nav_cancel() {
    with_engine(Engine::cancel);
}
#[unsafe(no_mangle)]
pub extern "C" fn nav_snapshot() -> *const u8 {
    let mut bytes = SNAPSHOT.lock().unwrap();
    *bytes = with_engine(|e| serde_json::to_vec(e).unwrap());
    bytes.push(0);
    bytes.as_ptr()
}
#[unsafe(no_mangle)]
pub extern "C" fn nav_snapshot_len() -> usize {
    SNAPSHOT.lock().unwrap().len().saturating_sub(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    // Independent uniform-cost oracle: own adjacency arithmetic, no A* helpers/heuristic.
    fn oracle(map: &Grid, start: usize, goal: usize) -> Option<usize> {
        if map.blocked[start] || map.blocked[goal] {
            return None;
        }
        let mut dist = vec![usize::MAX; map.width * map.height];
        let mut queue = VecDeque::from([start]);
        dist[start] = 0;
        while let Some(i) = queue.pop_front() {
            if i == goal {
                return Some(dist[i]);
            }
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let x = (i % map.width) as i32 + dx;
                let y = (i / map.width) as i32 + dy;
                if x < 0 || y < 0 || x >= map.width as i32 || y >= map.height as i32 {
                    continue;
                }
                let n = y as usize * map.width + x as usize;
                if !map.blocked[n] && dist[n] == usize::MAX {
                    dist[n] = dist[i] + 1;
                    queue.push_back(n);
                }
            }
        }
        None
    }
    #[test]
    fn astar_matches_independent_uniform_cost_oracle() {
        let mut seed = 42u64;
        for _ in 0..400 {
            let blocked = (0..192)
                .map(|_| {
                    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                    seed >> 60 < 5
                })
                .collect::<Vec<_>>();
            let map = Grid {
                width: 16,
                height: 12,
                resolution: 0.4,
                occupied: blocked.clone(),
                blocked,
            };
            let start = (seed >> 32) as usize % 192;
            let goal = seed as usize % 192;
            let route = map.plan(start, goal);
            assert_eq!(
                route.as_ref().map(|(p, _)| p.len() - 1),
                oracle(&map, start, goal)
            );
            if let Some((p, _)) = route {
                assert_eq!(p[0], start);
                assert_eq!(*p.last().unwrap(), goal);
                for w in p.windows(2) {
                    assert!(!map.blocked[w[1]]);
                    assert_eq!(
                        (w[0] % 16).abs_diff(w[1] % 16) + (w[0] / 16).abs_diff(w[1] / 16),
                        1
                    );
                }
            }
        }
    }
    #[test]
    fn goal_replacement_and_rejection_are_atomic() {
        let mut e = Engine::default();
        assert_eq!(e.set_goal(7.0, 2.6), 0);
        for _ in 0..35 {
            e.tick();
        }
        assert_eq!(e.set_goal(2.6, 3.0), 0);
        let id = e.goal_id;
        let before = serde_json::to_string(&e).unwrap();
        for (x, y, code) in [
            (-1.0, 2.0, 1),
            (f64::NAN, 2.0, 1),
            (12.0, 2.0, 1),
            (0.2, 0.2, 2),
            (10.6, 6.2, 3),
        ] {
            assert_eq!(e.set_goal(x, y), code);
            assert_eq!(serde_json::to_string(&e).unwrap(), before);
        }
        for _ in 0..5000 {
            e.tick();
        }
        assert_eq!(e.goal_id, id);
        assert_eq!(e.state, "arrived");
        assert!((e.pose[0] - 2.6).abs() < 1e-8 && (e.pose[1] - 3.0).abs() < 1e-8);
    }
    #[test]
    fn full_motion_preserves_disc_clearance_and_speed_bounds() {
        let mut e = Engine::default();
        for goal in [(7.0, 6.6), (10.6, 1.4), (1.4, 7.0), (10.6, 4.2), (1.4, 1.4)] {
            assert_eq!(e.set_goal(goal.0, goal.1), 0);
            for _ in 0..9000 {
                let old = e.pose;
                e.tick();
                // Independently check exact disc vs each obstacle rectangle at both ends
                // and midpoint of every <= 18 mm integration segment.
                for t in [0.0, 0.5, 1.0] {
                    let px = old[0] + t * (e.pose[0] - old[0]);
                    let py = old[1] + t * (e.pose[1] - old[1]);
                    for (i, occupied) in e.map.occupied.iter().enumerate() {
                        if !occupied {
                            continue;
                        }
                        let x = (i % WIDTH) as f64 * RESOLUTION;
                        let y = (i / WIDTH) as f64 * RESOLUTION;
                        let qx = px.clamp(x, x + RESOLUTION);
                        let qy = py.clamp(y, y + RESOLUTION);
                        assert!((px - qx).hypot(py - qy) >= RADIUS + MARGIN - 1e-8);
                    }
                }
                assert!((e.pose[0] - old[0]).hypot(e.pose[1] - old[1]) <= SPEED * DT + 1e-9);
                assert!(e.velocity[1].abs() <= TURN_RATE + 1e-9);
                if e.state == "arrived" {
                    break;
                }
            }
            assert_eq!(e.state, "arrived");
        }
    }
    #[test]
    fn every_grid_edge_has_continuous_swept_disc_clearance() {
        let map = Grid::demo();
        for start in 0..map.blocked.len() {
            if map.blocked[start] {
                continue;
            }
            for end in map.neighbors(start) {
                let a = map.center(start);
                let b = map.center(end);
                for (id, occupied) in map.occupied.iter().enumerate() {
                    if !occupied {
                        continue;
                    }
                    let x = (id % WIDTH) as f64 * RESOLUTION;
                    let y = (id / WIDTH) as f64 * RESOLUTION;
                    // For a cardinal segment its bounding box IS the segment.
                    // Interval gaps therefore give the exact minimum distance to
                    // each occupied rectangle over the whole continuous edge.
                    let dx = (x - a[0].max(b[0]))
                        .max(a[0].min(b[0]) - x - RESOLUTION)
                        .max(0.0);
                    let dy = (y - a[1].max(b[1]))
                        .max(a[1].min(b[1]) - y - RESOLUTION)
                        .max(0.0);
                    assert!(dx.hypot(dy) >= RADIUS + MARGIN - 1e-9);
                }
            }
        }
    }

    #[test]
    fn pause_cancel_and_same_cell() {
        let mut e = Engine::default();
        e.set_goal(7.0, 2.6);
        e.paused = true;
        let pose = e.pose;
        for _ in 0..100 {
            e.tick();
        }
        assert_eq!(pose, e.pose);
        e.cancel();
        e.paused = false;
        e.tick();
        assert_eq!(pose, e.pose);
        assert_eq!(e.velocity, [0.0; 2]);
        assert_eq!(e.set_goal(1.4, 1.4), 0);
        e.tick();
        assert_eq!(e.state, "arrived");
    }
    #[test]
    fn rapid_replacements_do_not_resurrect_old_goals() {
        let mut e = Engine::default();
        for i in 0..100 {
            assert_eq!(e.set_goal(if i % 2 == 0 { 7.0 } else { 2.6 }, 2.6), 0);
            for _ in 0..7 {
                e.tick();
            }
        }
        assert_eq!(e.goal_id, 100);
        for _ in 0..3000 {
            e.tick();
        }
        assert_eq!(e.state, "arrived");
        assert!((e.pose[0] - 2.6).abs() < 1e-8);
    }
}
