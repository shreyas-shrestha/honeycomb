---
name: reviewer-calculation
description: Marking guidance added to the reviewer brief for numeric and closed-form calculations.
version: "1.0.0"
applies_to: calculation
---

This question asks for a calculation that ends in a value or a closed-form expression. Mark it with these points in mind.

- Separate setup from arithmetic. The setup (choosing the right formula or model, identifying the quantities, substituting them correctly) carries most of the method points. The arithmetic carries few.
- A correct setup with an arithmetic slip keeps the setup points and loses only the points for the step that slipped and for the final value. A wrong setup worked out flawlessly earns no method points: accurate arithmetic on the wrong formula is not partial understanding.
- Carried errors are deducted once. If a wrong intermediate value is used consistently afterwards, the later steps keep their points. The exception is a result the student should have seen was impossible (a probability above 1, a negative count, a running time smaller than the input); say so in the comment.
- The final value must be in the form asked for: units where the quantity has them, the requested precision or an exact form, and a simplified asymptotic form when Big-O is asked (O(n^2), not O(3n^2 + n)). A right number with missing or wrong units loses the answer points where the course is strict.
- A bare final value with no work earns the answer points only, as in the base brief.
- In the feedback, say whether the error was in setup or in arithmetic. They call for different practice.
