# Revisione del codice & Piano di remediation — Varasto / Portable Inventory

> **Data:** 2026-06-22
> **Scope:** intero repository (backend Django ~353 file `.py`, frontend React/TS ~283 `.tsx`, SDK, docs MkDocs — ~106k righe)
> **Obiettivo:** verificare correttezza, best practice, modularità (evitare spaghetti code) e coerenza con il concetto del progetto, dopo la "grande pulizia".
> **Metodo:** lettura diretta del nucleo (engine, ledger, stock, modelli, strategie) + revisione in ampiezza con agenti su 4 aree (servizi/API, sicurezza/multi-tenancy, frontend, coerenza docs/igiene). Tutti i finding **Critical/High sono stati verificati a mano alle righe citate.**

---

## 1. Sintesi esecutiva

La pulizia è **in gran parte riuscita**. Il codice applicativo è pulito (zero `print`/`console.log` di debug in app, ~4 TODO tutti nei test, niente `.pyc`/cruft, split documentato del "god-module" engine). Il **nucleo è maturo**: ledger immutabile, locking concorrente serio (`select_for_update`), parser di formule sicuro (niente `eval`), scoping multi-tenant **in lettura** solido, parità chiavi i18n perfetta.

Restano però **problemi reali e concreti**, concentrati in tre aree:

1. **Sicurezza lato write** — alcune scritture sfuggono allo scoping (che è forte solo in lettura): un write cross-tenant, un endpoint con auth bypassabile sul `create`, chiavi API in chiaro.
2. **Funzionalità silenziosamente morte** — gli alert di scadenza non scattano mai (doppio bug); atomicità mancante su alcuni flussi.
3. **Documentazione che sovravende il concetto** — il ledger NON è la fonte di verità universale che la teoria dichiara; il catalogo strategie/engine è incompleto.

**Gate dinamici NON eseguiti in questo ambiente** (manca `ruff`, niente `node_modules`, niente DB): `make lint`, `make test-all`, `tsc` vanno rilanciati — vedi [Fase 0](#fase-0--ripristino-dei-gate-prerequisito).

### Conteggio finding per severità

| Severità | Numero | Aree |
| :--- | :---: | :--- |
| 🔴 Critical | 1 | write cross-tenant |
| 🟠 High | 7 | auth/chiavi, alert morti, build rotta, interceptor morto, coerenza docs |
| 🟡 Medium | 11 | atomicità, mass-assignment, modularità, docs stantie, tipi |
| ⚪ Low | 6 | envelope errori, naming, env, deps |

---

## 1bis. Stato remediation (2026-06-22)

Tutti i finding sono stati affrontati. Verifica: **backend `pytest` 976 passed,
0 regressioni** (le 39 failure residue sono pre-esistenti e ambientali — admin
template su Python 3.14/Django 4.2 + 1 artefatto `DEBUG=1`); **frontend `tsc` 0
errori, 1274 test passed** (3 failure pre-esistenti in `RegisterPage`, file non
toccato). Migrazione `0016_apikey_hash` applicata su DB pulito.

| ID | Stato | Note |
| :--- | :--- | :--- |
| SEC-01 | ✅ Fixed + test | `WorkOrderService` con lookup scoped + `save()`; test cross-tenant (batch + serial) |
| SEC-02 | ✅ Fixed + test | `ProductBatchViewSet` → `ReadOnlyModelViewSet`; test write-rejection |
| SEC-03 | ✅ Fixed + migr + test | `key_hash` SHA-256 + `key_prefix`; lookup via `ApiKey.find_active` (raw o token firmato); plaintext una sola volta; widget/QR usano token firmato revocabile |
| SEC-04 | ✅ Fixed | 17 fetch widget → header `X-Api-Key`; URL di navigazione/embed restano (deep-link, ora token) |
| SEC-05 | ✅ Fixed | `status`/`rate_limit_tier`/`is_active` read_only; `validate_default_location`/`validate_product_model` scoped; selettore tier rimosso dal modale |
| COR-01 | ✅ Fixed + test | guardia `== BATCH` + chiave `expiry_date`; test alert riscritto su PERISHABLE |
| COR-02..05 | ✅ Fixed | key bucket; `@transaction.atomic`; RMA resolve atomico (validate-then-apply); `Decimal` nel path widget |
| DOC-01..04 | ✅ Fixed | theory/index (ledger solo-BULK), strategies (6 engine), webhooks/specs/porte/rate-limit/SDK, paragrafo `ProfileBehavior`/`BaseEngine` |
| BP-01/02/04 | ✅ Fixed | `searchParams` dichiarato; interceptor su `axiosInstance`; envelope dashboard/pubblici → `{"detail"}` |
| BP-05 | ✅ Fixed | `requirements-dev.txt` + `ARG INSTALL_DEV` nel Dockerfile |
| HYG-01..04 | ✅ Fixed | rimossi 6 script + 6 dump `.txt`; `README.md`; `.env.example` allineato; naming + `mkdocs.yml` |
| MOD-01/02/04 | ✅ Done / 📝 Doc | `WorkOrderService` estratto; eccezioni choke-point documentate in `ledger.py`; ciclo servizi documentato |
| MOD-03 | ✅ Core done | Dispatch unificato sul **profilo** (`PolymorphicWidget` costruisce ora il payload via `PROFILE_METADATA`, come le hook) + payload-builder condiviso tipizzato in `widget/payload.ts`. I due path restano su endpoint diversi (`/widget/{id}/transaction/` vs `/widget/move/`); la decomposizione dei god-component **dashboard** (`products/models/show.tsx` 897 ecc.) non è stata affrontata. |
| BP-03 | ✅ Core done | Cuore widget/transazioni tipizzato: `useWidgetOperations`, `PolymorphicWidget`, `payload.ts`, i 4 pannelli engine, `BatchForm` e `types.ts` a **0 `any`/`as any`**; `ui_config as any` eliminato (`UiConfig`/`UiConfigField` tipizzati). Resta la coda lunga di `any` nelle altre feature. |

---

## 1ter. Verifica indipendente + 2ª remediation (2026-06-23)

Verifica indipendente dei fix dichiarati in §1bis **rileggendo il codice reale**
ed **eseguendo i gate** (che §1 dichiarava non eseguiti). Esito: i fix **backend**
reggono tutti; ma la riga §1bis "frontend tsc 0 / build verde" era un **FALSO
VERDE**, e l'audit aveva **mancato un Critical di sicurezza**.

### Falso verde del type-gate (causa-radice)
`make typecheck` = `npx tsc --noEmit` usa il `tsconfig.json` root, che è
`references`-only (`"files": []`) → **non controlla NULLA** (sempre 0 errori). Il
build vero (`npm run build` → `tsc -b`) aveva **88 errori** (~72 in produzione).
In più la cache `node_modules/.tmp/tsconfig.app.tsbuildinfo` può restituire uno 0
stantio. **Fix:** gate → `tsc -b --force`; aggiunta CI (`.github/workflows/ci.yml`).

### Nuovi finding (mancati da §1) — tutti risolti + test/verifica
| ID | Sev | Posizione | Fix |
| :-- | :--: | :-- | :-- |
| SEC-06 | 🔴 | `strategies.py` `execute_status_change` | lookup `PhysicalProduct` non-scoped → write cross-tenant dello status serializzato (raggiungibile dal widget con `physical_product_id` di altro tenant). Scoping a `engine.product.model` + 2 test cross-tenant. |
| BUILD-01 | 🔴 | frontend | il build non compilava (88 errori). 88→0 (root-cause sui contratti dei componenti condivisi + cuore widget, **0 `any`/`@ts-ignore`**); gate reale + CI. |
| COR-06 | 🟡 | `services/importer.py` | CSV accettava `expiry_date` non-ISO e lo salvava grezzo → logica scadenza morta / alert falsi. Normalizzazione ISO + test. |
| MOD-05 | 🟡 | `work_order.py`/`batch_manager.py` | 3 formati divergenti di `batch_identifier` → batch duplicati. Helper unico `ProductBatch.make_identifier` + test. |
| COR-07 | 🟡 | `hooks/useWidgetData.ts`, `PolymorphicWidget.tsx` | fetch in `useEffect` senza cancellazione → risposte stantie. AbortController. |
| BP-06 | 🟡 | `returns/transfers/sales/purchasing` form | `key={index}` su liste editabili → stato riga mis-associato su delete. Chiave stabile `_key`. |
| SEC-07 | ⚪ | `batch_manager.py` | `ProductModel.get` non-scoped → scoping a `work_order.company`. |
| DOC-05 | 🟡 | `docs/api/webhooks.md` | header firma `X-Webhook-Signature`→`X-PI-Signature`; retry policy allineata al codice (5 tentativi, 2ⁿ×60s). |
| DOC-06 | ⚪ | `docs/reference/api.md`, `versioning.md` | endpoint `product-models`; link redoc/docs. |
| MOD-06 | ⚪ | `factory.py`/`strategies.py` | test che blinda l'allineamento dei 3 registry di profilo. |

### Gate eseguiti (verde dimostrato, non più "da rilanciare")
- **Backend** `DEBUG=1 pytest -q`: **985 passed**, 39 failed (tutti baseline ambientale: py3.14 admin-template + e2e seed), **0 regressioni**.
- **Frontend** `tsc -b --force`: **0 errori** (il build compila). `vitest`: **1274 passed**, 3 falliti pre-esistenti (`RegisterPage`, `products/create`).

### Completati nella 3ª tornata (2026-06-23) — "gestire tutto, prod-ready"
Tutti gli item prima rinviati sono stati chiusi e **verificati col gate**:
- ✅ `process_transaction` god-function 270 → 173 righe (6 helper estratti); 0 regressioni.
- ✅ **6 god-component decomposti** (895/875/803/758/674/613 righe → 111/44/71/121/73/116) + ~70 sottocomponenti/hook coesi; comportamento preservato.
- ✅ **`any` azzerati**: 386 (`:any`/`as any`) + la coda profonda (`Record<string,any>`, generics, `catch`) → **0** reali in tutto `src`.
- ✅ **eslint 0 errori** (171 → 0; `no-explicit-any`, `set-state-in-effect` con disable giustificati sui pattern legittimi, fast-refresh via split file, ecc.).
- ✅ SEC-04 chiuso: deprecation-warning sul raw-key in query + redirect senza credenziale in URL (+3 test); MOD-03a payload widget unificato in `payload.ts`; `useWidgetData` tipizzato; `ProductService.clone_poly_instance` estratto; 3 test frontend pre-esistenti sistemati; import inline del ciclo documentati.

### Stato gate finale (2026-06-23) — verde dimostrato
- **Backend** `DEBUG=1 pytest -q`: **991 passed**, 39 env-fail (py3.14 admin + e2e), **0 regressioni**.
- **Frontend** `tsc -b --force`: **0**; `eslint .`: **0 errori**; `vitest`: **1277 passed / 1277**, 0 falliti.
- **CI** `.github/workflows/ci.yml`: gate reali (backend py3.11 + frontend `tsc -b`/eslint/vitest). Da validare al primo run su GitHub.

### 4ª tornata — caccia adversariale "forma del payload" (RUN-01..07)
Domanda: *"un audit fresco troverebbe altro?"* → **sì**. Una passata mirata, che
incrocia le **letture frontend** con ciò che il **backend serializer/service
emette davvero**, ha trovato **7 bug runtime** che **tsc + eslint + vitest
avevano tutti mancato**: ogni cast `as <Tipo>` mascherava una lettura di
proprietà sbagliata, e le **fixture dei test codificavano la stessa forma
errata** (verde ma scorretto).
- `BatchManagerPanel` (il peggiore): leggeva `entry.product_model_id`/`.name`/
  `.tracking_mode` e `batch.batch_id`, ma il backend (`widget_product.py`) annida
  sotto `model:{...}` e usa `item.id`. A runtime: nomi vuoti, **nessun ramo
  BULK/INDIVIDUAL renderizzato**, withdraw aperto su tutti i lotti. Tipo stretto
  alla forma reale → una lettura sbagliata ora **fallisce `tsc`**.
- `WorkOrderMovements` (`product_name`/`reason`), `work-orders/list`
  (`product_model_name`/`updated_at`, aggiunti al serializer), `poly/show`
  (`reason`), `ApiKeyList` (`key_prefix`).
- Gap backend annotato: `candidates` (autocomplete seriali) non emesso → scan libero.

**Insegnamento:** gate verdi (tipi+unit) **non** dimostrano correttezza runtime
contro il backend reale. I punti ciechi che restano richiedono **esecuzione**:
E2E/QA manuale, backfill della migrazione, Postgres (i test usano sqlite), primo
run CI. Un ulteriore audit *troverebbe ancora* (perf/N+1, a11y, concorrenza, SDK)
— con rendimenti decrescenti.

---

## 2. Legenda

**Severità:** 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low

**Stato verifica:**
- ✅ **Verificato** — letto personalmente alle righe citate.
- 🔎 **Da confermare** — segnalato da agente, alta confidenza, non riletto riga per riga.

---

## 3. Cosa è fatto bene (DA PRESERVARE)

Da non rompere durante i fix:

- **Concorrenza**: disciplina `select_for_update` nei `ProfileBehavior` e nei servizi ordini (purchasing/sales/transfers/rma/stocktake), con re-validazione sulla riga lockata.
- **Ledger immutabile**: `Movement.save()` rifiuta le modifiche; `clean()` valida la coerenza company su tutte le FK.
- **Scoping in lettura**: `CompanyScopedViewSet` + `resolve_effective_company` (modello developer/`X-Acting-Company`) applicati in modo coerente su ~20 viewset; nessun leak cross-tenant **in lettura**.
- **Sicurezza di base**: nessun sink di injection (`eval/exec/raw/pickle/yaml.load`), `SafeFormulaParser` senza `eval`, endpoint platform/superuser gated su `IsSuperuser`, token-exchange QR che tiene le chiavi fuori dagli URL.
- **Engine**: refactor pulito del god-module in `engines/{base,numeric,batch,tracker,formula,factory}.py`.
- **Frontend**: layer condiviso di qualità (`hooks/`, `components/ui/`), capability-gating fail-closed, refresh token single-flight, **parità chiavi i18n perfetta** (en↔it).

---

## 4. Findings dettagliati

### 4.1 🔒 Sicurezza & multi-tenancy (lato write)

| ID | Sev | Stato | Posizione | Sintesi |
| :--- | :---: | :---: | :--- | :--- |
| SEC-01 | 🔴 | ✅ | `inventory/serializers/work_orders.py:68-71` | Write cross-tenant su `PhysicalProduct` |
| SEC-02 | 🟠 | ✅ | `inventory/views/work_orders.py:165-195` | `ProductBatchViewSet`: `create` non autenticato + bypass ledger |
| SEC-03 | 🟠 | ✅ | `core/models.py:177` | API key salvate in chiaro |
| SEC-04 | 🟡 | ✅ | `auth.py:37` + `frontend widget hooks` | Chiavi API nei query string / URL |
| SEC-05 | 🟡 | ✅/🔎 | vari serializer | Mass-assignment di campi sensibili |

**SEC-01 — 🔴 Write cross-tenant via `WorkOrderSerializer.create`** ✅
`PhysicalProduct.objects.filter(id=physical_product_id).update(work_order=work_order, location=warehouse)`: il filtro **non ha scope company** e `.update()` **bypassa `clean()`** (unico punto che valida la coerenza company). Un utente del tenant A che invii `items:[{physical_product_id: <UUID di B>}]` riassegna un asset serializzato di B al proprio work order e lo sposta nel proprio magazzino. Precondizione: conoscere lo UUID (non enumerabile, ma trapela da QR/export/errori).
**Fix:**
```python
pp = PhysicalProduct.objects.filter(
    id=physical_product_id, product_model__company=work_order.company
).first()
if not pp:
    raise serializers.ValidationError({"items": "Physical product not found."})
pp.work_order = work_order
pp.location = warehouse
pp.save()  # gira clean()
```
Validare anche `product_model_id`/`quantity` (batch path, riga 77) contro `work_order.company`.

**SEC-02 — 🟠 `ProductBatchViewSet` scrivibile e con `create` non autenticato** ✅
`ModelViewSet` completo su `/api/v1/batches/` (`urls.py:30`), `permission_classes=[AllowAny]`; `_validate_api_key` è invocato **solo in `get_queryset`**, che il flusso `create` di DRF **non chiama** → POST non autenticato né permission-checked. Il serializer espone `product_model/location/quantity/work_order` scrivibili → scrittura di giacenza che **bypassa il `LedgerService`** (niente Movement né costing). `clean()` blocca il mix cross-company, ma non la creazione nel proprio tenant senza chiave.
**Fix:** convertire in `ReadOnlyModelViewSet`, oppure `perform_create/perform_update` che (a) chiamano `_validate_api_key(request)` con permesso `write`, (b) validano le FK contro `auth.company`, (c) instradano le scritture via `LedgerService`.

**SEC-03 — 🟠 API key in chiaro** ✅
`key = models.CharField(max_length=64, unique=True, db_index=True)`, confronto per uguaglianza (`auth.py:70`, `middleware/company_scope.py:51`, `throttling.py`). Una lettura DB (backup/replica/log/insider) espone credenziali live di **tutti** i tenant.
**Fix:** salvare solo `key_hash` (SHA-256, unique/indexed), cercare per hash, mostrare il plaintext una sola volta a creazione/rotazione; mantenere un prefisso non segreto per il display. Migrazione one-shot per le chiavi esistenti (o forzare rotazione).

**SEC-04 — 🟡 Chiavi API nei query string / URL** ✅
Backend le accetta da `?api_key=` (`auth.py:37`); frontend le mette in URL e redirect (`widget/hooks/useWidgetOperations.ts:32,68,…,437`, `useWidgetData.ts`, `PolymorphicWidget.tsx`). Finiscono in history, header `Referer`, log proxy.
**Fix:** solo header (`X-Api-Key`) o body lato frontend; il backend già le legge da header. Eventuale deprecazione del param query.

**SEC-05 — 🟡 Mass-assignment di campi sensibili**
- ✅ `serializers/work_orders.py:20-24` — `status` scrivibile → salto del lifecycle via PATCH.
- 🔎 `serializers/products.py` (`PhysicalProductSerializer`) — `product_model`/`status` scrivibili senza validazione company.
- 🔎 `core/serializers.py` (`ApiKeySerializer`) — `rate_limit_tier`/`is_active`/`default_location` scrivibili → auto-upgrade tier (bypass throttling), `default_location` IDOR cross-tenant.
**Fix:** `read_only` su `status`/`rate_limit_tier`/`is_active`; `validate_*` con il pattern `.get(id=..., company=...)` (già usato bene nei serializer ordini).

---

### 4.2 ✔️ Correttezza (non-security)

| ID | Sev | Stato | Posizione | Sintesi |
| :--- | :---: | :---: | :--- | :--- |
| COR-01 | 🟠 | ✅ | `inventory/monitors.py:50,54,65` | Alert di scadenza mai eseguiti (doppio bug) |
| COR-02 | 🟡 | ✅ | `inventory/services/widget_product.py:345` | Payload bucket: key `expiration_date` errata |
| COR-03 | 🟡 | ✅ | `inventory/orchestrators.py:36-141` | `handle_widget_movement` non atomico |
| COR-04 | 🟡 | 🔎 | `inventory/views/rma.py` (`resolve`) | Loop multi-riga RMA non atomico |
| COR-05 | ⚪ | ✅ | `engines/numeric.py`, `widget_transaction.py` | `float` nel path widget vs `Decimal` del ledger |

**COR-01 — 🟠 Alert di scadenza morti (doppio bug)** ✅
In `DateOffsetMonitor.check`: (1) la guardia `if product_model.tracking_mode != TRACKING_MODE_BULK: return` esce per tutto ciò che non è BULK — ma i `ProductBatch` esistono solo in **BATCH** (guardia invertita); (2) legge `batch.data.get('expiration_date')` (righe 54, 65) mentre **ogni writer** usa `expiry_date` (`stock.py`, `purchasing.py`, `onboarding.py`, `importer.py`, `widget_transaction.py`, `engines/batch.py`). Risultato: gli alert non scattano mai.
**Fix:** guardia `== TRACKING_MODE_BATCH` (o BATCH/PERISHABLE) **e** chiave `expiry_date`. Aggiungere un test che verifichi l'emissione di un `EventLog` su batch in scadenza.

**COR-02 — 🟡 Payload widget bucket con key errata** ✅
`services/widget_product.py:345` emette `"expiration_date": b.data.get('expiration_date')` → sempre `None` (la riga 380 `time_based` usa correttamente `expiry_date`).
**Fix:** `expiry_date`.

**COR-03 — 🟡 `handle_widget_movement` non atomico** ✅
Non è `@transaction.atomic`: `resolve_or_create_item` (riga 98) crea/riattiva un `PhysicalProduct` *prima* del `LedgerService.transfer_stock` (riga 121). Se il ledger solleva, l'item creato/riattivato **non viene rollbackato** → item fantasma / riattivazioni spurie.
**Fix:** avvolgere il corpo in `transaction.atomic()` (l'atomic del ledger annida come savepoint).

**COR-04 — 🟡 Loop multi-riga RMA non atomico** 🔎
`views/rma.py` `resolve` itera `RmaService.resolve_line` (atomico per riga) senza transazione esterna → su payload multi-riga con errore a metà, le righe già processate restano committate mentre la risposta è 4xx.
**Fix:** `transaction.atomic()` attorno al loop, come `SalesService.ship`/`PurchasingService.receive`. **Da confermare** alle righe.

**COR-05 — ⚪ Precisione `float` vs `Decimal`** ✅
Gli engine numerici lavorano in `float` (`engines/numeric.py`); `widget_transaction.py` fa `Decimal(str(float(...)))`. Il salto per `float` può introdurre errore di rappresentazione prima del `Decimal` del ledger. Impatto limitato (per BULK lo stock reale è `Decimal` dal ledger), ma incoerente con la doc.
**Fix:** parsare direttamente `Decimal(str(...))` nel path widget.

---

### 4.3 🧭 Coerenza col concetto

| ID | Sev | Stato | Posizione | Sintesi |
| :--- | :---: | :---: | :--- | :--- |
| DOC-01 | 🟠 | ✅ | `docs/concepts/theory.md`, `docs/index.md` | "Stock = derivata pura del ledger" falso per BATCH/INDIVIDUAL |
| DOC-02 | 🟠 | ✅ | `docs/concepts/strategies.md` | "4 strategie" vs 7 profili / 6 engine reali |
| DOC-03 | 🟡 | 🔎 | `docs/api/webhooks.md`, `reference/specifications.md`, `getting-started/index.md` | Documentazione stantia |
| DOC-04 | ⚪ | ✅ | `docs/reference/architecture.md` | Doppia astrazione `ProfileBehavior`/`BaseEngine` non documentata |

**DOC-01 — 🟠 Il ledger non è la fonte di verità universale** ✅
`theory.md` (§4.3 "Conservation of Mass") e `index.md` presentano lo stock come derivata pura del ledger `Movement` con "auditabilità assoluta". **Vero solo per BULK** (verificato in `services/stock.py`):
- BULK → derivato (`Σ in − Σ out`). ✅
- BATCH/PERISHABLE → **campo mutabile** `ProductBatch.quantity` (`stock.py:85-88`, mutato in `strategies.py:178-179`).
- INDIVIDUAL → **conteggio** `PhysicalProduct` (`stock.py:91-98`).

Per BATCH/INDIVIDUAL i `Movement` sono un log di audit *parallelo* che **può divergere**. Lo dice persino il docstring del codice (`stock.py:63-69`).
**Fix:** riformulare la doc (l'invariante di conservazione è *per-transazione*, derivabile in pieno *solo* per BULK); opzionale: comando di riconciliazione ledger↔stato.

**DOC-02 — 🟠 Catalogo strategie/engine incompleto** ✅
`strategies.md` documenta "4 strategie", ma il codice ha **7 profili → 6 engine** (`profiles.py`, `engines/factory.py:14-21`). Mancano dalla doc: `converter`/UNIT_CONVERSION, `dimension`/DIMENSIONAL, `time_based`/PERISHABLE. "Composite/Assembly" è descritto come engine dedicato ma **non esiste** (ASSEMBLED = `counter` + `WorkOrder`/`ProductComponent`). Simboli inventati (`COMPOSITION`/`KIT`; `CONVERTER` usato per "Simple", che collide col vero converter).

Mappa reale (profilo → engine → behavior):

| Profilo | Engine | Behavior |
| :--- | :--- | :--- |
| SIMPLE_COUNT | counter | Bulk |
| UNIT_CONVERSION | converter | Bulk |
| DIMENSIONAL | dimension | Bulk |
| BATCH_TRACKED | bucket | Batch |
| PERISHABLE | time_based | Batch |
| SERIALIZED | tracker | Serialized |
| ASSEMBLED | counter (+ assembly) | Assembled |

**Fix:** riscrivere su 6 engine + pattern assembly, con i veri costanti `engine_type`/`tracking_mode`/`strategy_type`.

**DOC-03 — 🟡 Documentazione stantia** 🔎
- `docs/api/webhooks.md` dice "Planned" ma i webhook **sono implementati** (HMAC, `services/notifications.py`).
- `docs/reference/specifications.md` descrive un modello `License` **inesistente** (il licensing è su `Company`); campi `PhysicalProduct`/`Company` errati.
- `docs/getting-started/index.md` usa URL **senza porte** (`http://localhost` invece di `:5173`/`:8001`/`:8002`).
- Rate-limit incoerenti: `reference/api.md` (100/h) vs settings (1000/h + 100/min).
- `docs/sdk/api-reference.md` esporta tipi inesistenti (`WidgetEventType`, `PostMessageType`).
**Fix:** allineare al codice.

**DOC-04 — ⚪ Doppia astrazione non documentata** ✅
Esistono due astrazioni parallele per prodotto: `ProfileBehavior` (`strategies.py`, path di **scrittura**/ledger) e `BaseEngine` (`engines/`, path **UI/calcolo delta**). Separazione legittima ma il layering `profile → {tracking_mode, engine_type} → {behavior, engine}` non è documentato.
**Fix:** un paragrafo in `docs/reference/architecture.md`.

---

### 4.4 🧩 Modularità / spaghetti

| ID | Sev | Stato | Posizione | Sintesi |
| :--- | :---: | :---: | :--- | :--- |
| MOD-01 | 🟡 | ✅ | `services/{batch_manager,onboarding}.py`, `serializers/work_orders.py` | Scritture di stock fuori dal "single choke point" |
| MOD-02 | 🟡 | ✅ | `serializers/work_orders.py:40-85` | Logica di business nei serializer |
| MOD-03 | 🟡 | ✅ | `frontend` (più file) | God-component + due widget paralleli |
| MOD-04 | ⚪ | ✅ | `inventory/services/*` | Import inline = ciclo di dipendenze |

**MOD-01 — 🟡 Choke point del ledger frammentato** ✅
Il "single choke point" dichiarato in `services/ledger.py:76-80` è di fatto **3 path**: `LedgerService` (corretto), `BatchManagerService` (muta `ProductBatch.quantity` + Movement self-loop diretti), serializer/onboarding (`WorkOrderSerializer.create` crea batch; `onboarding.py` fa `Movement.objects.create` diretto per i serializzati, saltando costing/idempotenza).
**Fix:** convogliare tutte le scritture nel `LedgerService`, o documentare esplicitamente le eccezioni.

**MOD-02 — 🟡 Logica di business nei serializer** ✅
`WorkOrderSerializer.create` crea `ProductBatch`, sceglie il magazzino, sintetizza identificatori — mutazione d'inventario dentro un serializer.
**Fix:** spostare in un `WorkOrderService`.

**MOD-03 — 🟡 God-component e widget duplicati (frontend)** ✅
File enormi: `products/models/show.tsx` (897), `inventory/stock/list.tsx` (876), `work-orders/show.tsx` (758), `movements/create.tsx` (674). E **due implementazioni del widget** con discriminanti diversi: `PolymorphicWidget.tsx` (dispatch su `engine` string) vs stack hooks `useWidgetOperations`/`useWidgetData` (dispatch su `profile`/`PROFILE_METADATA`) → rischio drift sul cuore polimorfico.
**Fix:** una sola fonte di verità (`profile` + `PROFILE_METADATA`), payload-builder condiviso; decomporre i componentoni in sottocomponenti + hook.

**MOD-04 — ⚪ Cicli di dipendenza nei servizi** ✅
Import inline come workaround di cicli (ledger ↔ reservations ↔ stock ↔ costing). Non rompe nulla ma è lo smell di layering principale.
**Fix:** valutare un livello `services/_base` o interfacce per spezzare il ciclo.

---

### 4.5 🛠️ Best practices (build & tipi)

| ID | Sev | Stato | Posizione | Sintesi |
| :--- | :---: | :---: | :--- | :--- |
| BP-01 | 🟠 | ✅ | `frontend/.../widget/app/ScannerWidget.tsx:67-75` | `searchParams` non dichiarato → build rotta |
| BP-02 | 🟠 | ✅ | `frontend/src/providers/AxiosErrorHandler.tsx:10` | Interceptor errori su istanza axios sbagliata (morto) |
| BP-03 | 🟡 | ✅ | frontend (451 occorrenze) | `any` pervasivo che vanifica `strict` |
| BP-04 | ⚪ | ✅/🔎 | views dashboard / public | Envelope d'errore incoerente |
| BP-05 | ⚪ | ✅ | `backend/requirements.txt` | Dev deps nell'immagine prod |

**BP-01 — 🟠 Build rotta in `ScannerWidget.tsx`** ✅
`searchParams` usato 4 volte (righe 67-75) ma **mai dichiarato** (il gemello `Widget.tsx:7` lo definisce con `new URL(window.location.href).searchParams`). È `TS2304` → `tsc -b` (primo step di `npm run build`) **fallisce**; a runtime `ReferenceError` che rompe il deep-link QR. **Implica che il type-check non gira in CI.**
**Fix:** aggiungere `const searchParams = new URL(window.location.href).searchParams;` **e** mettere `tsc -b` come gate CI.

**BP-02 — 🟠 Interceptor errori morto** ✅
`AxiosErrorHandler.tsx:10` registra sull'`axios` **globale**, ma il traffico passa per `axiosInstance = axios.create(...)` (`providers/axios-client.ts:5`). Gli interceptor del default non valgono per l'istanza → **i toast 403/500/400 non scattano mai**.
**Fix:** registrare sull'`axiosInstance` condiviso.

**BP-03 — 🟡 `any` pervasivo** ✅
451 occorrenze (94 `as any`), concentrate nel cuore widget/transazioni (`useWidgetOperations.ts`, `ui_config as any`). Vanifica `strict` proprio dove vive la complessità polimorfica.
**Fix:** modellare le risposte API (estendere `src/types/api.ts`), discriminated union per `ui_config`. Correlati: `key={idx}`/`key={Math.random()}` su liste dati, `useEffect` con deps mancanti, fetch senza cancellazione (race) — il pattern corretto esiste già in `console/hooks.ts`/`useDefaultApiKey.ts`.

**BP-04 — ⚪ Envelope d'errore incoerente** ✅/🔎
Dashboard che usa `{"error": ...}` invece di `{"detail": ...}` (`views/products.py:94`, `views/work_orders.py:162`); superficie pubblica che mescola `{"error"}`/`{"detail"}`.
**Fix:** `{"detail": ...}` sul dashboard; una sola forma sulla superficie pubblica.

**BP-05 — ⚪ Dev deps in prod** ✅
`requirements.txt` mischia runtime e dev (`pytest`, `pytest-django`, `django-debug-toolbar`).
**Fix:** `requirements-dev.txt` separato.

---

### 4.6 🧹 Igiene repo

| ID | Sev | Stato | Posizione | Sintesi |
| :--- | :---: | :---: | :--- | :--- |
| HYG-01 | 🟠 | ✅ | `backend/*.py` (6 file) | Script di debug git-tracked e rotti |
| HYG-02 | 🟡 | ✅ | root | Manca `README.md` |
| HYG-03 | 🟡 | ✅ | `.env.example` | Variabili fuorvianti / morte |
| HYG-04 | ⚪ | ✅ | repo-wide | Drift del nome (Varasto vs portable-inventory) |

**HYG-01 — 🟠 Script di debug git-tracked e rotti** ✅
`backend/{create_kit,debug_demo_box,inspect_medkit,list_products,repro_500,verify_prod_id}.py`: scratch ad-hoc; 5 puntano a un settings module **inesistente** (`portable_inventory.settings`; il vero è `config.settings`) → non eseguibili. `repro_500.py` contiene una finta password/token. Hanno bypassato l'hook `no-debug-prints` del pre-commit.
**Fix:** `git rm` tutti e 6.

**HYG-02 — 🟡 Manca il README di root** ✅
Buco di onboarding (GitHub mostra il vuoto, il sito MkDocs non è scopribile).
**Fix:** README breve: descrizione prodotto, quick-start con **porte corrette**, link a docs + CONTRIBUTING.

**HYG-03 — 🟡 `.env.example` fuorviante** ✅
Documenta `ALLOWED_HOSTS` (il codice legge `DJANGO_ALLOWED_HOSTS`, `settings.py:23`) e `JWT_*_LIFETIME_MINUTES` **morti** (`SIMPLE_JWT` hardcoded a 15min/7gg, `settings.py:250-252`); `VITE_API_URL` stantio; manca `FRONTEND_BASE_URL`.
**Fix:** allineare a `settings.py`.

**HYG-04 — ⚪ Drift del nome** ✅
"Varasto" (40 file) vs "portable-inventory" (slug) vs "Portable Inventory".
**Fix:** dichiararlo una volta (prodotto = Varasto, slug tecnico = portable-inventory) e allineare `mkdocs.yml`.

---

## 5. Piano di remediation

> Checklist tracciabile per ID. Effort indicativo: S ≤ 1h · M ≈ mezza giornata · L ≈ 1+ giorni.

### Fase 0 — Ripristino dei gate (prerequisito)
Senza questi, le fasi successive non sono verificabili.

- [ ] Installare deps e lanciare i gate: `cd frontend && npm ci && npx tsc --noEmit` (scopre subito BP-01) — **S**
- [ ] `make lint` (ruff backend + eslint frontend) — **S**
- [ ] `make test-all` (backend + frontend + SDK + schema API) come baseline — **M**
- [ ] Wirare `tsc -b` + `lint` + `test` in CI (blocco merge) — **M**

### Fase 1 — Sicurezza critica
- [ ] **SEC-01** scopare il lookup in `WorkOrderSerializer.create` + `save()` — **S**
- [ ] **SEC-02** `ProductBatchViewSet` read-only o `perform_create/update` validati + via `LedgerService` — **M**
- [ ] **SEC-05** `read_only` su `status`/`rate_limit_tier`/`is_active`; `validate_*` con scope company — **M**
- [ ] **SEC-03** hashing API key (`key_hash` SHA-256) + migrazione/rotazione — **M**
- [ ] **SEC-04** spostare le chiavi API fuori da query string/URL (back + front) — **M**
- [ ] Aggiungere test di isolamento cross-tenant sul lato **write** (regressione SEC-01/02/05) — **M**

### Fase 2 — Bug funzionali
- [ ] **COR-01** fix guardia (`== BATCH`) + key `expiry_date` in `monitors.py` + test alert — **S**
- [ ] **COR-02** `expiration_date` → `expiry_date` in `widget_product.py:345` — **S**
- [ ] **COR-03** `@transaction.atomic` su `handle_widget_movement` — **S**
- [ ] **COR-04** confermare e avvolgere il loop RMA in `transaction.atomic()` — **S**
- [ ] **COR-05** `Decimal(str(...))` diretto nel path widget — **S**

### Fase 3 — Coerenza documentazione
- [ ] **DOC-01** riscrivere la sezione ledger di `theory.md`/`index.md` (solo-BULK) — **S**
- [ ] **DOC-02** riscrivere `strategies.md` su 6 engine + assembly — **M**
- [ ] **DOC-03** sbloccare webhooks, correggere `specifications.md`, porte in getting-started, rate-limit, export SDK — **M**
- [ ] **DOC-04** paragrafo su `ProfileBehavior`/`BaseEngine` in `architecture.md` — **S**

### Fase 4 — Modularità / refactor (opportunistico)
- [ ] **MOD-02** estrarre `WorkOrderService` dalla logica del serializer — **M**
- [ ] **MOD-01** convogliare le scritture di stock nel `LedgerService` (o documentare le eccezioni) — **L**
- [ ] **MOD-03** unificare i due widget su `profile`/`PROFILE_METADATA`; decomporre i god-component — **L**
- [ ] **BP-03** tipizzare il core widget/transazioni; rimuovere `any`/`as any` — **L**
- [ ] **BP-02** unificare l'istanza axios (interceptor errori) — **S**
- [ ] **MOD-04** spezzare il ciclo di dipendenze dei servizi — **M**

### Fase 5 — Igiene
- [ ] **HYG-01** `git rm` dei 6 script di debug — **S**
- [ ] **HYG-02** aggiungere `README.md` di root — **S**
- [ ] **HYG-03** allineare `.env.example` a `settings.py` — **S**
- [ ] **HYG-04** dichiarare la convenzione di naming + allineare `mkdocs.yml` — **S**
- [ ] **BP-04** uniformare l'envelope d'errore — **S**
- [ ] **BP-05** separare `requirements-dev.txt` — **S**

---

## 6. Note finali

- **Verifica:** i finding 🔴/🟠 e la maggior parte dei 🟡 sono stati **letti personalmente** alle righe citate. Gli item marcati 🔎 (SEC-05 parziale, COR-04, DOC-03) sono ad alta confidenza ma da riconfermare puntualmente.
- **Gate non eseguiti qui:** `ruff` assente, `node_modules` non installato, nessun DB → `make lint`/`make test-all`/`tsc` da rilanciare nell'ambiente di sviluppo (Fase 0). È probabile che il type-check frontend non sia attualmente parte della CI (vedi BP-01).
- **Giudizio complessivo:** codice ~90% pulito e architettura solida; il grosso del lavoro residuo è **mettere in sicurezza il lato write** e **riallineare la documentazione al codice**.
