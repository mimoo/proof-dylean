import Lean
import Examples.SignedDH.SanityChecks

/- Run the SignedDH sanity-check scenarios and export the resulting execution
   traces as JSON, one structured object per entry. Nothing here is a proof:
   it executes the same Traceful programs the sanity checks evaluate. -/
open Lean DY DY.Example.SignedDH

namespace ExportTrace

def hex (ba : ByteArray) : String := String.join (ba.toList.map fun b => (Nat.toDigits 16 b.toNat |> fun ds => (if ds.length < 2 then "0" else "") ++ String.ofList ds))

def printable (ba : ByteArray) : Option String :=
  if ba.size > 0 && ba.toList.all (fun b => b.toNat ≥ 32 && b.toNat < 127) then some (String.fromUTF8! ba) else none

partial def bytesJson (b : Bytes) : Json :=
  if let some v := b.view? Random.Random then
    Json.mkObj [("t", "random"), ("timestamp", toJson v.timestamp), ("size", toJson v.size)]
  else if let some v := b.view? Literal.Literal.SubF then
    Json.mkObj ([("t", Json.str "literal"), ("hex", toJson (hex v.lit)), ("length", toJson v.lit.size)] ++ (match printable v.lit with | some s => [("text", toJson s)] | none => ([] : List (String × Json))))
  else if let some v := b.view? Concat.Concat.SubF then
    Json.mkObj [("t", "concat"), ("lhs", bytesJson v.lhs), ("rhs", bytesJson v.rhs)]
  else if let some v := b.view? Hash.Hash.SubF then
    Json.mkObj [("t", "hash"), ("input", bytesJson v.input)]
  else if let some v := b.view? Signature.Vk.SubF then
    Json.mkObj [("t", "vk"), ("sk", bytesJson v.sk)]
  else if let some v := b.view? Signature.Sign.SubF then
    Json.mkObj [("t", "sign"), ("sk", bytesJson v.sk), ("nonce", bytesJson v.nonce), ("msg", bytesJson v.msg)]
  else if let some v := b.view? DiffieHellman.DhPk.SubF then
    Json.mkObj [("t", "dhPk"), ("sk", bytesJson v.sk)]
  else if let some v := b.view? DiffieHellman.Dh.SubF then
    Json.mkObj [("t", "dh"), ("pk", bytesJson v.pk), ("sk", bytesJson v.sk)]
  else
    Json.mkObj [("t", "unknown")]

def eventJson : SignedDHEvent → Json
  | .ClientInitiateEvent client xPk => Json.mkObj [("event", "ClientInitiateEvent"), ("client", toJson client), ("xPk", bytesJson xPk)]
  | .ServerFinishEvent server xPk yPk kS => Json.mkObj [("event", "ServerFinishEvent"), ("server", toJson server), ("xPk", bytesJson xPk), ("yPk", bytesJson yPk), ("kS", bytesJson kS)]
  | .ClientFinishEvent client server xPk yPk kC => Json.mkObj [("event", "ClientFinishEvent"), ("client", toJson client), ("server", toJson server), ("xPk", bytesJson xPk), ("yPk", bytesJson yPk), ("kC", bytesJson kC)]

def local_ {S : Type} (st : PersistentLocalState.LocalState S) (fields : S → List (String × Json)) : Json :=
  Json.mkObj ([("participant", toJson st.participant)] ++ fields st.state)

def clientInit (s : ClientInitiateState) := [("xPk", bytesJson s.xPk), ("xSk", bytesJson s.xSk)]
def clientFin (s : ClientFinishState) := [("xPk", bytesJson s.xPk), ("kC", bytesJson s.kC)]
def serverFin (s : ServerFinishState) := [("yPk", bytesJson s.yPk), ("kS", bytesJson s.kS)]
def secretKey (s : LongTermKeys.SecretKeyState "SignedDH PKI") := [("sk", bytesJson s.sk)]

abbrev LS := PersistentLocalState.LocalState
abbrev StoreE (S : Type) := PersistentGlobalState.State.ExecEntryT S
abbrev CompE (S : Type) := ProtocolEvent.ExecEntryT (PersistentGlobalState.Compromise.CompromiseEvent S)

def entryJson (tr : ExecTrace) (i : Nat) : Json :=
  let kind (k : String) (d : Json) : Json := Json.mkObj [("i", toJson i), ("kind", k), ("data", d)]
  if let some (e : Network.ExecEntryT) := tr.at? i then kind "message" (Json.mkObj [("msg", bytesJson e.msg)])
  else if let some (e : Random.ExecEntryT) := tr.at? i then kind "random" (Json.mkObj [("length", toJson e.length)])
  else if let some (e : ProtocolEvent.ExecEntryT SignedDHEvent) := tr.at? i then kind "event" (eventJson e.ev)
  else if let some (e : StoreE (LS ClientInitiateState)) := tr.at? i then kind "store" (Json.mkObj [("stateType", "ClientInitiateState"), ("state", local_ e.st clientInit)])
  else if let some (e : StoreE (LS ClientFinishState)) := tr.at? i then kind "store" (Json.mkObj [("stateType", "ClientFinishState"), ("state", local_ e.st clientFin)])
  else if let some (e : StoreE (LS ServerFinishState)) := tr.at? i then kind "store" (Json.mkObj [("stateType", "ServerFinishState"), ("state", local_ e.st serverFin)])
  else if let some (e : StoreE (LS (LongTermKeys.SecretKeyState "SignedDH PKI"))) := tr.at? i then kind "store" (Json.mkObj [("stateType", "SecretKeyState \"SignedDH PKI\""), ("state", local_ e.st secretKey)])
  else if let some (e : StoreE (LongTermKeys.PublicKeyState "SignedDH PKI")) := tr.at? i then kind "storeGlobal" (Json.mkObj [("stateType", "PublicKeyState \"SignedDH PKI\""), ("state", Json.mkObj [("p", toJson e.st.p), ("pk", bytesJson e.st.pk)])])
  else if let some (e : CompE (LS ClientInitiateState)) := tr.at? i then kind "compromise" (Json.mkObj [("stateType", "ClientInitiateState"), ("state", local_ e.ev.state clientInit)])
  else if let some (e : CompE (LS ClientFinishState)) := tr.at? i then kind "compromise" (Json.mkObj [("stateType", "ClientFinishState"), ("state", local_ e.ev.state clientFin)])
  else if let some (e : CompE (LS ServerFinishState)) := tr.at? i then kind "compromise" (Json.mkObj [("stateType", "ServerFinishState"), ("state", local_ e.ev.state serverFin)])
  else if let some (e : CompE (LS (LongTermKeys.SecretKeyState "SignedDH PKI"))) := tr.at? i then kind "compromise" (Json.mkObj [("stateType", "SecretKeyState"), ("state", local_ e.ev.state secretKey)])
  else kind "unknown" (Json.mkObj [("sumIndex", toJson (match (tr.at? i : Option ExecTrace.Entry) with | some e => e.id.val | none => 999))])

def traceJson (name : String) (prog : Traceful Unit) : Json :=
  let result := prog.run Trace.nil
  let tr : ExecTrace := result.snd.val
  Json.mkObj [
    ("name", toJson name),
    ("succeeded", toJson (result.fst.isSome)),
    ("length", toJson tr.length),
    ("entries", Json.arr ((List.range tr.length).map (entryJson tr)).toArray)
  ]

end ExportTrace

def main (args : List String) : IO Unit := do
  let out := Json.mkObj [
    ("scenarios", Json.arr #[
      ExportTrace.traceJson "honestAttacker" honestAttacker,
      ExportTrace.traceJson "compromiseClientEphAttacker" compromiseClientEphAttacker
    ])
  ]
  match args with
  | [path] => IO.FS.writeFile path (out.pretty 2 ++ "\n")
  | _ => IO.println (out.pretty 2)
