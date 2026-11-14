import { demoExperiences } from "./demo-experiences";
import { localISO } from "./mastery";
import type { ClassBundle, Course, Question, Topic } from "./types";

// A hand-written sample so the app is usable without an API key. Dates are set
// relative to the day the demo is loaded so the exam countdown always has
// something to show.
export const DEMO_ID = "demo-cs1332";
const ID = DEMO_ID;
const t = (k: string) => `${ID}.${k}`;
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localISO(d);
};

export function buildDemoCourse(): ClassBundle {
  const e1 = `${ID}.exam.1`;
  const e2 = `${ID}.exam.2`;
  const fin = `${ID}.exam.final`;
  const topic = (k: string, unit: number, title: string, summary: string, objectives: string[], prereqs: string[], exams: string[], weight: number): Topic => ({
    id: t(k),
    unitId: `${ID}.u${unit}`,
    title,
    summary,
    objectives,
    prereqs: prereqs.map(t),
    examIds: [...exams, fin],
    weight,
  });

  const course: Course = {
    id: ID,
    code: "CS 1332",
    title: "Data Structures and Algorithms",
    instructor: "",
    term: "",
    aiPolicy:
      "Sample policy: AI tools may be used to study concepts. Homework code must be your own, and any AI help on coursework must be disclosed.",
    grading: [
      { name: "Homework", pct: 20 },
      { name: "Exam 1", pct: 25 },
      { name: "Exam 2", pct: 25 },
      { name: "Final", pct: 30 },
    ],
    exams: [
      { id: e1, title: "Exam 1", date: inDays(-20), weightPct: 25 },
      { id: e2, title: "Exam 2", date: inDays(9), weightPct: 25 },
      { id: fin, title: "Final exam", date: inDays(27), weightPct: 30 },
    ],
    units: [
      { id: `${ID}.u0`, title: "Foundations", when: "Weeks 1–3" },
      { id: `${ID}.u1`, title: "Trees", when: "Weeks 4–7" },
      { id: `${ID}.u2`, title: "Hashing", when: "Week 8" },
      { id: `${ID}.u3`, title: "Sorting", when: "Weeks 9–10" },
      { id: `${ID}.u4`, title: "Graphs", when: "Weeks 11–14" },
    ],
    topics: [
      topic("big-o", 0, "Big-O analysis", "Describing how running time grows with input size.", ["Find the Big-O of loops and nested loops", "Tell worst-case from amortized cost", "Drop constants and lower-order terms correctly"], [], [e1], 3),
      topic("arraylists", 0, "ArrayLists and amortized resizing", "A list backed by an array that grows when full.", ["Trace add and remove at any index", "Explain why adding to the back is amortized O(1)"], ["big-o"], [e1], 2),
      topic("linked-lists", 0, "Linked lists", "Singly, doubly and circular linked lists.", ["Implement add and remove with head and tail pointers", "Compare operation costs with an ArrayList"], ["big-o"], [e1], 2),
      topic("stacks-queues", 0, "Stacks and queues", "LIFO and FIFO structures on arrays and linked lists.", ["Implement a circular array queue", "Choose the right backing structure"], ["arraylists", "linked-lists"], [e1], 2),
      topic("bst", 1, "Binary search trees", "Ordered binary trees and their add, remove and traversal operations.", ["Trace add and the three remove cases", "Produce pre-, in-, post- and level-order traversals", "Explain why an unbalanced BST degrades to O(n)"], ["linked-lists"], [e2], 3),
      topic("heaps", 1, "Binary heaps", "Complete binary trees stored in an array, used for priority queues.", ["Trace add (up-heap) and remove (down-heap)", "Compute parent and child indices", "Explain why buildHeap is O(n)"], ["bst"], [e2], 3),
      topic("avl", 1, "AVL trees", "Self-balancing BSTs that rotate to keep height logarithmic.", ["Compute heights and balance factors", "Pick and perform the right single or double rotation"], ["bst"], [e2], 3),
      topic("hashmaps", 2, "HashMaps and collision handling", "Key-value storage with external chaining and linear probing.", ["Trace puts and removes under linear probing", "Explain load factor and resizing", "Say why removals need DEL markers"], ["arraylists"], [e2], 3),
      topic("sorts", 3, "Merge sort and quicksort", "Divide-and-conquer sorting and its best, average and worst cases.", ["Trace both algorithms", "State stability, in-place and complexity for each"], ["big-o"], [], 2),
      topic("bfs-dfs", 4, "Graph traversal: BFS and DFS", "Visiting every vertex with a queue or a stack.", ["Trace BFS and DFS from a start vertex", "Pick the traversal that fits a problem"], ["stacks-queues"], [], 2),
      topic("dijkstra", 4, "Dijkstra’s shortest paths", "Shortest paths from one source using a priority queue.", ["Trace Dijkstra’s with a distance map", "Explain why negative edges break it"], ["bfs-dfs", "heaps"], [], 3),
    ],
    basis: "demo",
    sources: [],
    createdAt: new Date().toISOString(),
  };

  let n = 0;
  const mcq = (k: string, prompt: string, choices: string[], answerIndex: number, solution: string, difficulty: number): Question => ({
    id: `${t(k)}.q${n++}`, topicId: t(k), kind: "mcq", prompt, choices, answerIndex, solution, rubric: [], difficulty,
  });
  const free = (k: string, prompt: string, solution: string, rubric: string[]): Question => ({
    id: `${t(k)}.q${n++}`, topicId: t(k), kind: "free", prompt, choices: [], answerIndex: 0, solution, rubric, difficulty: 3,
  });

  const questions: Record<string, Question[]> = {
    [t("big-o")]: [
      mcq("big-o", "What is the Big-O of this code in terms of `n`?\n\n```java\nfor (int i = 0; i < n; i++) {\n    for (int j = 1; j < n; j *= 2) {\n        count++;\n    }\n}\n```", ["$O(n)$", "$O(n \\log n)$", "$O(n^2)$", "$O(\\log n)$"], 1, "The outer loop runs $n$ times. The inner loop doubles `j` each pass, so it runs about $\\log_2 n$ times. Multiply: $O(n \\log n)$. Choosing $O(n^2)$ comes from assuming every nested loop is quadratic without checking how the inner counter moves.", 2),
      mcq("big-o", "A function takes $3n^2 + 100\\,n\\log n + 5$ steps. What is its tightest Big-O?", ["$O(n \\log n)$", "$O(n^3)$", "$O(n^2)$", "$O(n^2 \\log n)$"], 2, "Keep the fastest-growing term and drop its constant. $n^2$ outgrows $n \\log n$ for large $n$ no matter how big the coefficient on the smaller term is, so the answer is $O(n^2)$.", 1),
      mcq("big-o", "For an ArrayList that doubles its backing array when full, adding to the **back** is:", ["$O(1)$ worst case", "$O(n)$ amortized", "$O(\\log n)$ amortized", "$O(1)$ amortized, $O(n)$ worst case"], 3, "Most adds just write one slot. The occasional add that triggers a resize copies all $n$ elements, so the worst single add is $O(n)$. Spread over all the cheap adds before it, the average is $O(1)$: that is the amortized cost.", 2),
      free("big-o", "An ArrayList that **doubles** when full has amortized $O(1)$ add-to-back. Explain why, and explain why growing by a fixed 10 slots each time would not give the same result.", "A resize copies every element, costing $n$. With doubling, resizes happen at sizes 1, 2, 4, 8, ..., so over $n$ adds the total copying is $1 + 2 + 4 + \\dots + n < 2n$. Total work is under $3n$ for $n$ adds, or $O(1)$ each. With +10 growth a resize happens every 10 adds, copying 10, 20, 30, ... elements, which sums to about $n^2/20$. That is $O(n)$ per add on average.", ["A resize copies all current elements, costing O(n)", "With doubling, total copy work over n adds is a geometric sum bounded by about 2n", "So the average cost per add is constant", "Fixed-size growth resizes every constant number of adds, making total copy work O(n²) and amortized cost O(n)"]),
    ],
    [t("bst")]: [
      mcq("bst", "Which traversal of a BST visits the data in sorted order?", ["Preorder", "Inorder", "Postorder", "Level-order"], 1, "Inorder visits left subtree, node, right subtree. Everything in the left subtree is smaller and everything in the right is larger, so the output is ascending.", 1),
      mcq("bst", "Insert 50, 30, 70, 20, 40, 60, 80 into an empty BST in that order. Then remove 50 using the **successor**. What is the new root?", ["40", "70", "60", "30"], 2, "50 has two children, so it is replaced by its successor: the smallest value in the right subtree. Go right to 70, then left as far as possible: 60. The root becomes 60. Picking 40 means you used the predecessor instead.", 2),
      mcq("bst", "What is the worst-case time to search a BST holding $n$ values?", ["$O(1)$", "$O(\\log n)$", "$O(n \\log n)$", "$O(n)$"], 3, "Nothing forces a plain BST to stay balanced. If values arrive in sorted order the tree becomes a chain of height $n-1$, and a search may walk all of it. $O(\\log n)$ is only the case for a balanced tree.", 1),
      free("bst", "You insert 1, 2, 3, 4, 5, 6, 7 into an empty BST in that order. Describe the shape of the tree, give its height, and say what this does to the cost of `contains`. How would you avoid it?", "Each value is larger than everything before it, so each becomes the right child of the previous one. The tree is a chain, in effect a linked list, with height 6 (a single node has height 0). `contains` may visit all 7 nodes, so it is $O(n)$ instead of $O(\\log n)$. A self-balancing tree such as an AVL tree rotates during insertion to keep height $O(\\log n)$.", ["Tree degenerates into a right-leaning chain, like a linked list", "Height is 6, that is n-1", "Search becomes O(n)", "Use a self-balancing tree such as AVL (or insert in a balanced order)"]),
    ],
    [t("heaps")]: [
      mcq("heaps", "In a heap stored in an array starting at index 1, what is the index of the parent of the element at index 11?", ["4", "5", "6", "10"], 1, "With 1-indexing the children of index $i$ are $2i$ and $2i+1$, so the parent is $\\lfloor i/2 \\rfloor = \\lfloor 11/2 \\rfloor = 5$.", 1),
      mcq("heaps", "A min-heap is stored 1-indexed as `[_, 2, 5, 3, 9, 6, 8]`. What is the array after one `remove()`?", ["`[_, 3, 5, 8, 9, 6]`", "`[_, 5, 3, 9, 6, 8]`", "`[_, 3, 5, 6, 9, 8]`", "`[_, 8, 5, 3, 9, 6]`"], 0, "Remove the root (2), move the last element (8) to the root, then down-heap. 8’s children are 5 and 3; swap with the smaller, 3, giving `[_, 3, 5, 8, 9, 6]`. Index 3 now has no children, so stop. The last option forgets to down-heap.", 2),
      mcq("heaps", "What is the running time of the buildHeap algorithm, which down-heaps from the last non-leaf node back to the root?", ["$O(\\log n)$", "$O(n \\log n)$", "$O(n)$", "$O(n^2)$"], 2, "It looks like $n$ down-heaps of $O(\\log n)$ each, but most nodes are near the bottom and move very few levels. Half the nodes are leaves and move zero. Summing the actual work gives $O(n)$. Adding $n$ items one at a time is the $O(n \\log n)$ approach.", 2),
      free("heaps", "A heap has height $O(\\log n)$, yet finding an arbitrary value in it takes $O(n)$. Explain why, and contrast with a balanced BST.", "The heap property only orders a parent against its children. It says nothing about left versus right, so when looking for a value you cannot rule out either subtree and may have to check every node. A BST orders left < node < right, so each comparison discards a whole subtree and a balanced BST finds a value in $O(\\log n)$.", ["Heap order only relates parent and child", "There is no ordering between left and right subtrees, so no subtree can be discarded", "Search may visit every node, O(n)", "A BST’s ordering lets each comparison discard half the tree"]),
    ],
    [t("hashmaps")]: [
      mcq("hashmaps", "A table of capacity 11 uses linear probing with index `key % 11`. You put keys 22, 33, 44 in that order. At which index does 44 end up?", ["0", "1", "2", "4"], 2, "All three keys hash to 0. 22 takes index 0. 33 collides and probes to 1. 44 collides at 0 and at 1, and lands at 2.", 1),
      mcq("hashmaps", "With linear probing, why is a removed entry marked as deleted (a DEL marker) and not simply set to null?", ["To save memory when the table is resized", "So a later search keeps probing past that slot", "To keep the load factor from changing", "So the key can be restored if it is added again"], 1, "A search stops when it reaches null. If a removed slot became null, any key that had probed past it would become unreachable. The marker tells searches to keep going.", 2),
      mcq("hashmaps", "A table has capacity 13 and a maximum load factor of 0.67, checked before each add. Adding which entry triggers the first resize?", ["The 8th", "The 9th", "The 10th", "The 13th"], 1, "Adding the 8th gives $8/13 \\approx 0.615$, which is fine. Adding the 9th would give $9/13 \\approx 0.692 > 0.67$, so the table resizes before that add.", 2),
      free("hashmaps", "When a HashMap resizes, each entry is re-inserted into the new array and not copied to the same index it had before. Explain why.", "An entry’s index is its hash code modulo the table capacity. Changing the capacity changes that result for most keys, so an entry left at its old index would not be where a lookup searches for it. Re-inserting also drops DEL markers and breaks up probe clusters.", ["Index is computed from the hash and the capacity (hash mod capacity)", "A new capacity gives a different index for most keys", "Copying to the old index would make lookups miss the entry", "Rehashing also clears DEL markers or clusters (bonus)"]),
    ],
  };

  const lessons: Record<string, string> = {
    [`${t("big-o")}:walkthrough`]: `Big-O describes how the number of steps grows as the input size $n$ grows. You keep the fastest-growing term and drop constants, because for large $n$ nothing else matters.

\`\`\`java
for (int i = 0; i < n; i++) {        // A
    for (int j = 0; j < n; j += 2) { // B
        sum += i * j;
    }
}
\`\`\`

1. **Count loop A.** \`i\` goes 0, 1, ..., $n-1$: that is $n$ passes.
2. **Count loop B for one pass of A.** \`j\` goes up by 2, so about $n/2$ passes. The bound does not depend on \`i\`.
3. **Multiply**, because B runs in full for every pass of A: $n \\cdot n/2 = n^2/2$.
4. **Drop the constant**: $O(n^2)$.

The step people skip is 2. Always ask how the inner counter changes. Adding a constant gives about $n$ passes; multiplying by a constant gives about $\\log n$.

### Amortized cost

Some operations are usually cheap and occasionally expensive. Adding to the back of an ArrayList is $O(1)$ until the array is full, then one add costs $O(n)$ to copy everything. Averaged over a long run of adds, it is $O(1)$ **amortized**. Worst case and amortized are different questions, and exams ask for both.

### Your turn

\`\`\`java
for (int i = 1; i < n; i *= 2) {
    for (int j = 0; j < n; j++) {
        count++;
    }
}
\`\`\`

Steps 1 and 2: how many passes does each loop make? Then finish steps 3 and 4 yourself.`,
    [`${t("bst")}:walkthrough`]: `A binary search tree keeps one rule at every node: everything in the left subtree is smaller, everything in the right subtree is larger. Every operation is a walk from the root that uses this rule to pick a side.

### Worked example: remove with two children

Start with the tree built from 50, 30, 70, 20, 40, 60, 80:

\`\`\`
        50
      /    \\
    30      70
   /  \\    /  \\
 20   40  60   80
\`\`\`

Remove **30** using the successor.

1. **Find the node.** 30 < 50, go left. Found.
2. **Which case?** No children: delete it. One child: replace it with that child. Two children: this case.
3. **Find the successor**, the smallest value larger than 30. Go right once (40), then left as far as possible. 40 has no left child, so the successor is 40.
4. **Copy 40 into the node** that held 30. The order rule still holds, because 40 is larger than everything on the left and is the smallest thing on the right.
5. **Remove the old 40** from the right subtree. It has no children, so it is the easy case.

The successor never has a left child, which is why step 5 is always one of the two easy cases.

### Why shape matters

Each step moves down one level, so add, remove and contains cost $O(\\text{height})$. A balanced tree has height about $\\log n$. Insert sorted data and the tree becomes a chain with height $n-1$, and everything is $O(n)$.

### Your turn

In the original tree, remove **50** using the successor. Steps 1 and 2 are done: it is the root and has two children. Find the successor, then say what the root becomes and which node gets deleted.`,
    [`${t("heaps")}:walkthrough`]: `A binary heap is a **complete** binary tree (every level full except possibly the last, filled left to right) where each parent is smaller than its children (min-heap). Completeness means it fits in an array with no gaps. In CS 1332 the array starts at index 1: the children of index $i$ are $2i$ and $2i+1$, and the parent is $\\lfloor i/2 \\rfloor$.

### Worked example: remove

Min-heap \`[_, 2, 5, 3, 9, 6, 8]\`:

\`\`\`
        2
      /   \\
     5     3
    / \\   /
   9   6 8
\`\`\`

1. **Save the root** (2). That is the return value.
2. **Move the last element to the root.** Taking the last slot keeps the tree complete: \`[_, 8, 5, 3, 9, 6]\`.
3. **Down-heap.** 8 is at index 1 with children 5 and 3. Swap with the **smaller** child so the new parent is smaller than both: \`[_, 3, 5, 8, 9, 6]\`.
4. **Repeat from the new position.** 8 is at index 3; its children would be at 6 and 7, which are past the end. Stop.

Swapping with the larger child in step 3 would put 5 above 3 and break the heap.

### Costs

Add (place at the end, up-heap) and remove (above) each walk one root-to-leaf path: $O(\\log n)$. Peeking at the minimum is $O(1)$. Searching for an arbitrary value is $O(n)$, because the heap rule says nothing about left versus right.

### Your turn

Add **1** to \`[_, 3, 5, 8, 9, 6]\`. It goes in at index 6. Its parent is at index 3. Carry out the up-heap and write the final array.`,
    [`${t("hashmaps")}:walkthrough`]: `A HashMap turns a key into an array index with \`Math.abs(key.hashCode() % capacity)\`, so put, get and remove are $O(1)$ on average. Two keys can land on the same index. With **linear probing**, a colliding entry moves forward one slot at a time until it finds space.

### Worked example

Capacity 7, index = \`key % 7\`. Put 10, 17, 3, then remove 17, then look up 3.

| Step | Work | Table (index 0 to 6) |
|---|---|---|
| put 10 | 10 % 7 = 3, free | \`_ _ _ 10 _ _ _\` |
| put 17 | 17 % 7 = 3, taken; try 4 | \`_ _ _ 10 17 _ _\` |
| put 3 | 3 % 7 = 3, taken; 4 taken; try 5 | \`_ _ _ 10 17 3 _\` |
| remove 17 | found at 4; mark **DEL** | \`_ _ _ 10 DEL 3 _\` |
| get 3 | 3: no. 4: DEL, keep going. 5: found | |

The last row is why removal leaves a marker. A search stops at null, so if index 4 were set to null, \`get(3)\` would stop there and report the key missing.

### Load factor

Load factor = size ÷ capacity. As it rises, probe sequences get longer. CS 1332 resizes to $2 \\cdot \\text{capacity} + 1$ when an add would push the load factor above 0.67, and **re-inserts** every entry, because each index depends on the capacity. DEL markers are not carried over.

### Your turn

Same table, capacity 7, starting empty. Put 14, 21, 7 in that order. 14 % 7 = 0, so 14 goes to index 0. Work out where 21 and 7 land, then say which slots a \`get(7)\` examines.`,
  };

  return { course, questions, lessons, experiences: demoExperiences(t, course.createdAt) };
}
