---
name: reviewer-derivation
description: Marking guidance added to the reviewer brief for derivations, such as solving a recurrence or deriving a bound or formula.
version: "1.0.0"
applies_to: derivation
---

This question asks for a derivation: the student gets from a starting expression to a result through a chain of algebraic or analytic steps. Mark it with these points in mind.

- Each step must follow from the one before. Read the chain in order and stop at the first line that does not follow; that is where points come off. A result that appears with no steps leading to it earns the answer points only.
- Later steps that are correct given an earlier slip keep their method points. Deduct once for the slip.
- When the question asks for a tight bound (Theta, or "exactly"), both directions are needed: an upper bound alone, or an argument that only shows O, earns the points for that direction and no more. The same goes for an equality shown as one inequality.
- A named result (Master Theorem, a standard sum, a limit rule, an approximation) must be applicable. Give the points only if the student states or visibly checks the conditions, including which case applies.
- Assumptions have to be said: n a power of two, a dropped floor or ceiling, a small-angle or steady-state approximation, the sign of a quantity being divided by.
- Units and dimensions must be consistent from line to line where the course is strict about them. A final expression with the wrong dimensions loses the answer points even if the algebra looks tidy.
