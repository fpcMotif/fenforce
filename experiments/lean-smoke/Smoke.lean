namespace Smoke

theorem appendEmpty (values : List Nat) : values ++ [] = values := by
  induction values with
  | nil => rfl
  | cons head tail inductionHypothesis =>
    exact congrArg (List.cons head) inductionHypothesis

end Smoke
