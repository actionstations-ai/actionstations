// Repeat-determinism check (#503): two repeats at the same seed should score the same. The
// comparison uses each task's score and `details` (per-code lint counts, missed defects).

/** Names of the tasks whose score or details differ between two repeats; [] when identical. */
export function differingTasks(a, b) {
  const names = [...new Set([...a.tasks, ...b.tasks].map((t) => t.task))]
  return names.filter((name) => {
    const x = a.tasks.find((t) => t.task === name)
    const y = b.tasks.find((t) => t.task === name)
    return (
      !x || !y || x.score !== y.score || JSON.stringify(x.details) !== JSON.stringify(y.details)
    )
  })
}

/** The run file's `determinism` block for repeats that all used `seed`. */
export function determinismOf(repeats, seed) {
  const differing = new Set()
  for (let i = 1; i < repeats.length; i++)
    for (const t of differingTasks(repeats[0], repeats[i])) differing.add(t)
  return { seed, identical: differing.size === 0, differing: [...differing] }
}
