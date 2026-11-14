import type { Block, Experience } from "./types";

// Hand-written interactive lessons for the four ready topics of the sample course.
const E = "·"; // an empty slot in a trace row

const bigO: Block[] = [
  {
    kind: "check",
    prompt: "Guess first. This loop starts at 1 and **doubles** `j` each pass:\n\n```java\nfor (int j = 1; j < n; j *= 2) { work(); }\n```\n\nWith `n = 1000`, about how many passes does it make?",
    options: ["10", "500", "1,000", "2,000"],
    answer: 0,
    why: "Doubling gets big fast: 1, 2, 4, ... reaches 1,024 on the tenth doubling. The number of passes is about $\\log_2 n$, not $n$.",
  },
  {
    kind: "trace",
    title: "Watch the doubling loop with n = 16",
    frames: [
      { caption: "**Pass 1.** `j = 1`, which is less than 16, so the body runs.", cells: ["1", "2", "4", "8", "16"], active: [0] },
      { caption: "**Pass 2.** `j` doubles to 2.", cells: ["1", "2", "4", "8", "16"], active: [1] },
      { caption: "**Pass 3.** `j` doubles to 4.", cells: ["1", "2", "4", "8", "16"], active: [2] },
      { caption: "**Pass 4.** `j` doubles to 8.", cells: ["1", "2", "4", "8", "16"], active: [3] },
      { caption: "`j` doubles to 16. 16 is not less than 16, so the loop stops. Four passes for $n = 16$, and $\\log_2 16 = 4$.", cells: ["1", "2", "4", "8", "16"], active: [4] },
    ],
  },
  {
    kind: "text",
    title: "The counting rule",
    body: "Ask how the loop counter changes. **Adding** a constant each pass gives about $n$ passes. **Multiplying** by a constant gives about $\\log n$. A loop inside a loop multiplies the two counts; loops one after another add them, and the bigger one wins.",
  },
  {
    kind: "match",
    prompt: "Match each piece of code to its growth.",
    pairs: [
      { left: "A loop to `n` inside a loop to `n`", right: "$O(n^2)$" },
      { left: "A doubling loop inside a loop to `n`", right: "$O(n \\log n)$" },
      { left: "Two loops to `n`, one after the other", right: "$O(n)$" },
      { left: "One loop that halves `n` each pass", right: "$O(\\log n)$" },
    ],
  },
  {
    kind: "order",
    prompt: "Put the steps for analyzing a nested loop in order.",
    steps: ["Count how many times the outer loop runs", "For one outer pass, count the inner passes", "Combine the counts: multiply, or add them up if the inner count changes", "Drop constants and lower-order terms"],
    why: "The inner loop is counted from inside one outer pass because its count can depend on the outer variable. Simplifying comes last so nothing is dropped too early.",
  },
  {
    kind: "fill",
    prompt: "Complete the definition.",
    parts: ["Big-O keeps the ", " term and drops ", "."],
    blanks: ["fastest-growing", "constants"],
    bank: ["fastest-growing", "constants", "smallest", "exponents"],
    why: "For large $n$ the fastest-growing term dwarfs everything else, and a constant factor does not change the shape of the growth.",
  },
  {
    kind: "reveal",
    prompt: "Explain in your own words: why is adding to the back of an ArrayList $O(1)$ **amortized** but $O(n)$ in the **worst case**?",
    answer: "Most adds write one slot. When the array is full, one add copies all $n$ elements into a bigger array, which is the $O(n)$ worst case. Because the array doubles, those expensive adds are rare enough that the average over many adds stays constant.",
  },
];

const bst: Block[] = [
  {
    kind: "check",
    prompt: "You insert 1, 2, 3, 4, 5 into an empty binary search tree, in that order. What shape do you get?",
    options: ["A balanced tree of height 2", "A chain leaning right", "A chain leaning left", "It depends on the implementation"],
    answer: 1,
    why: "Each value is larger than everything already there, so it becomes the right child of the previous one. A BST’s shape is decided by insertion order.",
  },
  {
    kind: "text",
    title: "The ordering rule",
    body: "At every node, everything in the left subtree is smaller and everything in the right subtree is larger. Add, search and remove are all a walk from the root that uses this rule to pick a side, so each costs one step per level.",
  },
  {
    kind: "trace",
    title: "Remove 50, the root, using its successor",
    frames: [
      { caption: "The tree, written level by level: 50 at the root, then 30 and 70, then 20, 40, 60, 80. We want to remove **50**.", cells: ["50", "30", "70", "20", "40", "60", "80"], active: [0] },
      { caption: "50 has two children, so it cannot simply be cut out. Find its **successor**: go right once, to 70.", cells: ["50", "30", "70", "20", "40", "60", "80"], active: [2] },
      { caption: "Then go left as far as possible: 60. It has no left child, so 60 is the smallest value larger than 50.", cells: ["50", "30", "70", "20", "40", "60", "80"], active: [5] },
      { caption: "Copy 60 into the root. The ordering rule still holds: 60 is larger than everything on the left and smaller than everything else on the right.", cells: ["60", "30", "70", "20", "40", "60", "80"], active: [0] },
      { caption: "Remove the old 60. It is a leaf, so this is the easy case. Done.", cells: ["60", "30", "70", "20", "40", E, "80"], active: [5] },
    ],
  },
  {
    kind: "order",
    prompt: "Order the steps for removing a node that has two children.",
    steps: ["Find the node to remove", "Find its successor: one step right, then left until there is no left child", "Copy the successor’s value into the node", "Remove the successor from the right subtree"],
    why: "The copy has to happen before the successor is removed, or its value is lost.",
  },
  {
    kind: "match",
    prompt: "Match each traversal to the order it visits things.",
    pairs: [
      { left: "Preorder", right: "node, left, right" },
      { left: "Inorder", right: "left, node, right" },
      { left: "Postorder", right: "left, right, node" },
      { left: "Level-order", right: "top to bottom, left to right" },
    ],
  },
  {
    kind: "fill",
    prompt: "Complete the sentence.",
    parts: ["In a BST everything in the left subtree is ", " than the node, so an ", " traversal visits the data in sorted order."],
    blanks: ["smaller", "inorder"],
    bank: ["smaller", "inorder", "larger", "preorder"],
    why: "Left, node, right means everything smaller comes out before the node and everything larger after it.",
  },
  {
    kind: "reveal",
    prompt: "Explain in your own words: why does the successor never have a **left** child?",
    answer: "The successor is found by going left as far as possible in the right subtree. If it had a left child, that child would be smaller and still larger than the removed node, so we would have kept going and it would be the successor instead.",
  },
];

const heaps: Block[] = [
  {
    kind: "check",
    prompt: "In a **min-heap**, the smallest value is at the root. Where is the **largest**?",
    options: ["At the root as well", "Always at the last index", "Somewhere among the leaves", "In the root’s right subtree"],
    answer: 2,
    why: "The only rule is that a parent is smaller than its children. The largest value cannot have children, so it is a leaf, but nothing says which leaf.",
  },
  {
    kind: "text",
    title: "A tree stored in an array",
    body: "A heap is a **complete** binary tree, so it fits in an array with no gaps. In CS 1332 the array starts at index 1. The children of index $i$ are at $2i$ and $2i + 1$, and the parent is at $\\lfloor i/2 \\rfloor$.",
  },
  {
    kind: "trace",
    title: "remove() on the heap [_, 2, 5, 3, 9, 6, 8]",
    frames: [
      { caption: "The minimum is at index 1. Save **2** to return.", cells: ["_", "2", "5", "3", "9", "6", "8"], active: [1] },
      { caption: "Move the **last** element, 8, to the root. Taking the last slot keeps the tree complete.", cells: ["_", "8", "5", "3", "9", "6"], active: [1] },
      { caption: "8’s children are at indexes 2 and 3: the values 5 and 3. The smaller one is 3.", cells: ["_", "8", "5", "3", "9", "6"], active: [2, 3] },
      { caption: "Swap 8 with 3, the **smaller** child, so the new parent is smaller than both children.", cells: ["_", "3", "5", "8", "9", "6"], active: [1, 3] },
      { caption: "8 is now at index 3. Its children would be at 6 and 7, past the end of the array. Done.", cells: ["_", "3", "5", "8", "9", "6"], active: [3] },
    ],
  },
  {
    kind: "order",
    prompt: "Order the steps of add().",
    steps: ["Place the new value at the next open index", "Compare it with its parent at index ⌊i/2⌋", "Swap if the new value is smaller", "Repeat until the parent is smaller or you reach the root"],
    why: "Adding at the end keeps the tree complete; the swaps upward then restore the ordering.",
  },
  {
    kind: "check",
    prompt: "Add **1** to `[_, 3, 5, 8, 9, 6]`. What is the array afterward?",
    options: ["`[_, 3, 5, 8, 9, 6, 1]`", "`[_, 3, 5, 1, 9, 6, 8]`", "`[_, 1, 5, 3, 9, 6, 8]`", "`[_, 1, 3, 5, 8, 9, 6]`"],
    answer: 2,
    why: "1 goes in at index 6. Its parent at index 3 is 8, so they swap. Now at index 3, its parent at index 1 is 3, so they swap again. The first option stops before any swap; the second stops one swap early.",
  },
  {
    kind: "match",
    prompt: "Match each operation to its cost.",
    pairs: [
      { left: "Look at the minimum", right: "$O(1)$" },
      { left: "Add or remove", right: "$O(\\log n)$" },
      { left: "Find an arbitrary value", right: "$O(n)$" },
    ],
  },
  {
    kind: "reveal",
    prompt: "Explain in your own words: when down-heaping, why must you swap with the **smaller** child and not the larger?",
    answer: "After the swap the child becomes the parent of its sibling. If the larger child moved up, it would sit above the smaller one and break the rule that a parent is smaller than both children.",
  },
];

const hashmaps: Block[] = [
  {
    kind: "check",
    prompt: "Two keys hash to the same index. With **linear probing**, where does the second one go?",
    options: ["Into a linked list at that index", "Into the next open slot after it", "It replaces the first key", "Nowhere until the table resizes"],
    answer: 1,
    why: "Linear probing steps forward one slot at a time until it finds space. A list at the index is the other strategy, external chaining.",
  },
  {
    kind: "trace",
    title: "A table of capacity 7, index = key % 7",
    frames: [
      { caption: "**put 10.** 10 % 7 = 3. Slot 3 is free.", cells: [E, E, E, "10", E, E, E], active: [3] },
      { caption: "**put 17.** 17 % 7 = 3 as well. Slot 3 is taken, so probe forward.", cells: [E, E, E, "10", E, E, E], active: [3] },
      { caption: "Slot 4 is free. 17 lands there.", cells: [E, E, E, "10", "17", E, E], active: [4] },
      { caption: "**put 3.** 3 % 7 = 3. Slots 3 and 4 are both taken.", cells: [E, E, E, "10", "17", E, E], active: [3, 4] },
      { caption: "3 lands at slot 5, two steps from where it hashed.", cells: [E, E, E, "10", "17", "3", E], active: [5] },
      { caption: "**remove 17.** Found at slot 4. Mark it **DEL**; do not empty it.", cells: [E, E, E, "10", "DEL", "3", E], active: [4] },
      { caption: "**get 3.** Slot 3: no. Slot 4: DEL, keep going. Slot 5: found. An empty slot 4 would have ended the search and reported 3 missing.", cells: [E, E, E, "10", "DEL", "3", E], active: [3, 4, 5] },
    ],
  },
  {
    kind: "fill",
    prompt: "Complete the definition.",
    parts: ["Load factor is ", " divided by ", "."],
    blanks: ["size", "capacity"],
    bank: ["size", "capacity", "hash code", "collisions"],
    why: "It measures how full the table is. The fuller it gets, the longer the probe sequences.",
  },
  {
    kind: "check",
    prompt: "A table of capacity 11 holds 7 entries. What is its load factor?",
    options: ["About 0.36", "About 0.64", "About 1.57", "7"],
    answer: 1,
    why: "$7 / 11 \\approx 0.64$. With a maximum of 0.67 this table is fine, but one more entry would push it to 0.73 and force a resize first.",
  },
  {
    kind: "order",
    prompt: "Order the steps of a resize.",
    steps: ["Create a new array of capacity 2 × old + 1", "Walk the old array slot by slot", "Skip empty slots and DEL markers", "Re-insert each entry using its hash and the new capacity"],
    why: "Entries are re-inserted, not copied, because an index depends on the capacity.",
  },
  {
    kind: "match",
    prompt: "Match each term to what it means.",
    pairs: [
      { left: "External chaining", right: "each slot holds a list of entries" },
      { left: "Linear probing", right: "a collision moves to the next slot" },
      { left: "DEL marker", right: "keeps a search from stopping early" },
      { left: "Load factor", right: "how full the table is" },
    ],
  },
  {
    kind: "reveal",
    prompt: "Explain in your own words: after a resize, why can’t entries just be copied to the same index they had before?",
    answer: "An entry’s index is its hash code modulo the capacity. A new capacity gives most keys a different index, so an entry left at its old index would not be where a lookup searches for it.",
  },
];

export function demoExperiences(topicId: (key: string) => string, createdAt: string): Record<string, Experience> {
  const make = (key: string, blocks: Block[]): [string, Experience] => [topicId(key), { topicId: topicId(key), blocks, createdAt }];
  return Object.fromEntries([make("big-o", bigO), make("bst", bst), make("heaps", heaps), make("hashmaps", hashmaps)]);
}
