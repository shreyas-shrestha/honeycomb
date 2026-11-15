---
name: reviewer-trace
description: Marking guidance added to the reviewer brief for algorithm and data-structure traces.
version: "1.0.0"
applies_to: trace
---

This question is a trace: the student runs an algorithm or a data-structure operation by hand and shows what happens. Mark it with these points in mind.

- Every intermediate state matters. The marks are for the sequence of states (the array after each pass, the heap after each swap, the queue and visited set after each dequeue, the table after each row), not only for where it ends up.
- A correct final state with states skipped earns the points for the result and loses the method points for the states that are missing. Do not assume the student did the skipped work in their head.
- Check each state against the one before it, not only against the reference. An off-by-one or a single wrong swap that is then carried forward consistently is penalised once, where it happens; later states that follow correctly from the student's own earlier state keep their points.
- A trace that runs a different algorithm from the one asked (for example insertion sort when the question says selection sort, or BFS order when it says DFS) earns no method points, even if the final state matches.
- Where the course fixes a convention (tie-breaking order, 0- or 1-based indexing, which child is promoted), mark to that convention and name it in the comment.
- In the feedback, name the first state at which the trace goes wrong.
