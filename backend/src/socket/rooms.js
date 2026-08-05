// One definition of the room key, so a joiner and an emitter can never disagree
// about which string names an election's room. The `election:` prefix keeps
// these from colliding with socket.io's implicit per-socket rooms (which are
// named by socket id).
export function electionRoom(electionId) {
  return `election:${electionId}`;
}
