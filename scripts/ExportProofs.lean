import Lean
import Lean.Server.References

open Lean Meta

/- Export the actual Expr graph, retaining every argument and binder. No tactics
   are reinterpreted, and no fabricated proof steps are added. -/
structure Graph where
  ids : Std.HashMap Expr Nat := {}
  nodes : Array Json := #[]

abbrev ExportM := StateT Graph MetaM

def str (s : String) : Json := toJson s
def num (n : Nat) : Json := toJson n

def binder (b : BinderInfo) : String := match b with
  | .default => "explicit"
  | .implicit => "implicit"
  | .strictImplicit => "strict implicit"
  | .instImplicit => "instance"

partial def expr (e : Expr) : ExportM Nat := do
  if let some id := (← get).ids[e]? then return id
  let node ← match e with
    | .const n ls => pure <| Json.arr #[str "const", str n.toString, toJson (ls.map toString)]
    | .bvar i => pure <| Json.arr #[str "bvar", num i]
    | .sort l => pure <| Json.arr #[str "sort", str (toString l)]
    | .lit (.natVal n) => pure <| Json.arr #[str "nat", num n]
    | .lit (.strVal s) => pure <| Json.arr #[str "string", str s]
    | .app .. =>
      let head ← expr e.getAppFn
      let args ← e.getAppArgs.mapM expr
      pure <| Json.arr #[str "app", num head, toJson args]
    | .lam n t b bi =>
      let t ← expr t
      let b ← expr b
      pure <| Json.arr #[str "lam", str n.toString, num t, num b, str (binder bi)]
    | .forallE n t b bi =>
      let t ← expr t
      let b ← expr b
      pure <| Json.arr #[str "forall", str n.toString, num t, num b, str (binder bi)]
    | .letE n t v b _ =>
      let t ← expr t
      let v ← expr v
      let b ← expr b
      pure <| Json.arr #[str "let", str n.toString, num t, num v, num b]
    | .proj n i b =>
      let b ← expr b
      pure <| Json.arr #[str "proj", str n.toString, num i, num b]
    | .mdata _ b => return ← expr b
    | .fvar .. | .mvar .. => throwError "Unexpected free/metavariable in closed compiled term"
  let id := (← get).nodes.size
  modify fun s => {s with ids := s.ids.insert e id, nodes := s.nodes.push node}
  return id

def kind (ci : ConstantInfo) : String := match ci with
  | .thmInfo _ => "theorem"
  | .defnInfo _ => "definition"
  | .opaqueInfo _ => "opaque"
  | .axiomInfo _ => "axiom"
  | .recInfo _ => "recursor"
  | .ctorInfo _ => "constructor"
  | .inductInfo _ => "inductive"
  | .quotInfo _ => "quotient primitive"

def seeds : Array Name := #[
  `DY.Example.SignedDH.client_secrecy,
  `DY.Example.SignedDH.client_auth,
  `DY.Example.SignedDH.Client.finish.spec,
  `DY.Bytes.AttackerKnows_implies_Publishable,
  `DY.Bytes.AttackerKnows.is_least_fixpoint,
  `DY.Trace.Reachable_implies_Invariant,
  `DY.Fixpoint.mkLeastFixpoint_is_least]

def exportAll (out : System.FilePath) : ExportM Json := do
  let env ← getEnv
  let mut todo := seeds
  let mut seen : NameSet := {}
  let mut decls : Array Json := #[]
  while !todo.isEmpty do
    let n := todo.back!
    todo := todo.pop
    if seen.contains n then continue
    seen := seen.insert n
    let some ci := env.find? n | throwError "Missing declaration {n}"
    let t ← expr ci.type
    let mut body := Json.null
    if let some v := ci.value? true then
      body := num (← expr v)
      todo := todo ++ v.getUsedConstants
    todo := todo ++ ci.type.getUsedConstants
    let moduleName := (env.getModuleIdxFor? n).map (fun i => env.header.moduleNames[i.toNat]!)
    let ranges ← findDeclarationRanges? n
    decls := decls.push <| Json.mkObj [
      ("name", str n.toString), ("module", toJson (moduleName.map toString)),
      ("kind", str (kind ci)), ("type", num t), ("body", body),
      ("fields", toJson ((if isStructure env n then getStructureFields env n else #[]).map toString)),
      ("range", toJson (ranges.map Lsp.DeclInfo.ofDeclarationRanges))]
  for n in seeds do
    let ci ← getConstInfo n
    let some v := ci.value? true | throwError "No body for {n}"
    let opts := (← getOptions).setBool `pp.proofs true |>.setBool `pp.fullNames true
      |>.setBool `pp.deepTerms true
      |>.set `pp.maxSteps 100000000 |>.set `pp.width 100
    let text ← withOptions (fun _ => opts) do
      let t ← ppExpr ci.type
      let v ← ppExpr v
      pure s!"-- Compiled proof, equivalent to #print {n}\n{kind ci} {n} :\n{t}\n:=\n{v}\n"
    liftM <| IO.FS.writeFile (out / s!"{n}.txt") text
    if n == seeds[0]! then
      let text ← withOptions (fun _ => opts.setBool `pp.all true) do
        let v ← ppExpr v
        pure s!"-- set_option pp.all true in #print {n}\n{v}\n"
      liftM <| IO.FS.writeFile (out / "client_secrecy.explicit.txt") text
  return Json.mkObj [("declarations", toJson decls), ("nodes", toJson (← get).nodes),
    ("seeds", toJson (seeds.map toString)), ("format", num 1)]

def main (args : List String) : IO UInt32 := do
  let [output] := args | throw <| IO.userError "Expected output directory"
  unsafe enableInitializersExecution
  initSearchPath (← findSysroot)
  let opts := ({} : Options).set `maxRecDepth 100000 |>.set `maxHeartbeats 0
  let env ← importModules #[{module := `Examples.SignedDH.SecurityTheorems}] opts (loadExts := true)
  IO.FS.createDirAll output
  let ((data, graph), _, _) ← (exportAll output).run {} |>.toIO
    {fileName := "ExportProofs", fileMap := FileMap.ofString "", options := opts} {env := env}
  IO.FS.writeFile (System.FilePath.mk output / "proofs.json") data.compress
  IO.println s!"Exported {graph.nodes.size} expression nodes"
  return 0
