use nav_core::Engine;
fn main() {
    let mut e = Engine::default();
    e.set_goal(7.0, 2.6);
    for _ in 0..37 {
        e.tick();
    }
    e.set_goal(2.6, 3.0);
    for _ in 0..100 {
        e.tick();
    }
    println!("{}", serde_json::to_string(&e).unwrap());
}
