---------------------------- MODULE Counter ----------------------------
EXTENDS Naturals

CONSTANT Bound
VARIABLE counter

Init == counter = 0
Next == IF counter < Bound THEN counter' = counter + 1 ELSE counter' = 0

TypeOK == counter \in 0..Bound
NeverTwo == counter # 2
=======================================================================
