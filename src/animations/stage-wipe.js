// The original stage wipes, followed by the coloured maze walk.
export const stageWipeAnimation = {
  name: "wipe",

  async play({ strip, wait, finishMaze }) {
    for (const stage of ["tones", "graph", "maze"]) {
      if (!(await wait(stage === "tones" ? 500 : 250))) return false;
      strip.focus(stage);
      if (!(await wait(950))) return false;
    }

    if (!(await finishMaze())) return false;
    return wait(450);
  },
};
