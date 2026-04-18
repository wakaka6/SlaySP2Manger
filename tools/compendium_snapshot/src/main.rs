use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap};
use std::env;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::rc::Rc;

use chrono::Utc;
use dotscope::assembly::{decode_blocks, Immediate, Instruction, Operand};
use dotscope::metadata::method::MethodRc;
use dotscope::metadata::tables::{FieldRc, MemberRefSignature};
use dotscope::metadata::token::Token;
use dotscope::metadata::typesystem::{CilTypeRc, CilTypeReference};
use dotscope::{CilObject, ValidationConfig};
use serde::{Deserialize, Serialize, Serializer};

type AppResult<T> = Result<T, String>;

const CARD_NAMESPACE: &str = "MegaCrit.Sts2.Core.Models.Cards";

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> AppResult<()> {
    let config = Config::from_env()?;
    let release_info = read_release_info(&config.game_root)?;
    let pck = PckArchive::open(&config.game_root.join("SlayTheSpire2.pck"))?;
    let parser = CardAssemblyParser::new(
        &config
            .game_root
            .join("data_sts2_windows_x86_64")
            .join("sts2.dll"),
    )?;
    if let Some(class_name) = &config.inspect_class {
        parser.inspect_class(class_name)?;
        return Ok(());
    }
    let portrait_index = build_portrait_index(&pck)?;

    let mut cards = Vec::new();
    let mut missing_art = Vec::new();

    for type_def in parser.iter_card_types() {
        let class_name = type_def.name.clone();
        let card_id = pascal_to_snake(&class_name).to_ascii_uppercase();
        let field_values = parser.parse_ctor_fields(&type_def)?;
        let simple_getters = parser.build_simple_getters(&type_def, &field_values)?;
        let base = parser.parse_base_ctor_args(&type_def)?;
        let card_type = base.type_name.clone();
        let art_stem = choose_art_stem(&class_name, &card_type);
        let art_info = portrait_index.get(&art_stem);
        if art_info.is_none() {
            missing_art.push(card_id.clone());
        }

        cards.push(SnapshotCard {
            id: card_id,
            class_name,
            energy: base.energy,
            type_name: card_type,
            rarity: base.rarity,
            target: base.target,
            upgradable: base.upgradable,
            vars: parser
                .eval_get_canonical_vars(&type_def, &field_values, &simple_getters)?
                .into_iter()
                .map(SerializableVar::from)
                .collect(),
            keywords: parser.parse_keywords(&type_def)?,
            upgrade: SerializableUpgrade::from(parser.parse_upgrade(&type_def)?),
            character: art_info.map(|item| item.character.clone()),
            art_stem,
            art_import_path: art_info.map(|item| item.import_path.clone()),
            art_ctex_path: art_info.map(|item| item.ctex_path.clone()),
        });
    }

    cards.sort_by(|left, right| {
        let left_character = left.character.as_deref().unwrap_or("zzz");
        let right_character = right.character.as_deref().unwrap_or("zzz");
        left_character
            .cmp(right_character)
            .then_with(|| left.type_name.cmp(&right.type_name))
            .then_with(|| left.id.cmp(&right.id))
    });

    let snapshot = SnapshotFile {
        version: release_info.version.clone(),
        commit: release_info.commit.clone(),
        generated_at: Utc::now().to_rfc3339(),
        card_count: cards.len(),
        missing_art_ids: missing_art,
        cards,
    };

    fs::create_dir_all(&config.output_dir).map_err(|error| error.to_string())?;
    let output_path = config
        .output_dir
        .join(format!("card-metadata.{}.json", release_info.version));
    let json = serde_json::to_string_pretty(&snapshot).map_err(|error| error.to_string())?;
    fs::write(&output_path, format!("{json}\n")).map_err(|error| error.to_string())?;

    println!("Wrote {} cards to {}", snapshot.card_count, output_path.display());
    println!("Missing art: {}", snapshot.missing_art_ids.len());
    Ok(())
}

#[derive(Debug, Clone)]
struct Config {
    game_root: PathBuf,
    output_dir: PathBuf,
    inspect_class: Option<String>,
}

impl Config {
    fn from_env() -> AppResult<Self> {
        let default_game_root = PathBuf::from(r"E:\SteamLibrary\steamapps\common\Slay the Spire 2");
        let default_output_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("src-tauri")
            .join("resources")
            .join("compendium");

        let mut game_root = default_game_root;
        let mut output_dir = default_output_dir;
        let mut inspect_class = None;

        let args = env::args().skip(1).collect::<Vec<_>>();
        let mut index = 0;
        while index < args.len() {
            match args[index].as_str() {
                "--game-root" => {
                    index += 1;
                    let value = args
                        .get(index)
                        .ok_or_else(|| "missing value for --game-root".to_string())?;
                    game_root = PathBuf::from(value);
                }
                "--output" => {
                    index += 1;
                    let value = args
                        .get(index)
                        .ok_or_else(|| "missing value for --output".to_string())?;
                    output_dir = PathBuf::from(value);
                }
                "--help" | "-h" => {
                    println!(
                        "Usage: cargo run --manifest-path tools/compendium_snapshot/Cargo.toml -- [--game-root <path>] [--output <dir>] [--inspect-class <Name>]"
                    );
                    std::process::exit(0);
                }
                "--inspect-class" => {
                    index += 1;
                    let value = args
                        .get(index)
                        .ok_or_else(|| "missing value for --inspect-class".to_string())?;
                    inspect_class = Some(value.clone());
                }
                other => {
                    return Err(format!("unknown argument: {}", other));
                }
            }
            index += 1;
        }

        if !game_root.exists() {
            return Err(format!("game root not found: {}", game_root.display()));
        }

        Ok(Self {
            game_root,
            output_dir,
            inspect_class,
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct ReleaseInfo {
    version: String,
    commit: Option<String>,
}

fn read_release_info(game_root: &Path) -> AppResult<ReleaseInfo> {
    let path = game_root.join("release_info.json");
    serde_json::from_str(&fs::read_to_string(&path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

#[derive(Debug, Clone)]
struct PckEntry {
    offset: u64,
    size: u64,
}

#[derive(Debug)]
struct PckArchive {
    path: PathBuf,
    entries: HashMap<String, PckEntry>,
}

impl PckArchive {
    fn open(path: &Path) -> AppResult<Self> {
        let mut file = File::open(path).map_err(|error| error.to_string())?;

        let mut magic = [0_u8; 4];
        file.read_exact(&mut magic).map_err(|error| error.to_string())?;
        if &magic != b"GDPC" {
            return Err("unexpected PCK magic".to_string());
        }

        let _version = read_u32(&mut file)?;
        let _godot_major = read_u32(&mut file)?;
        let _godot_minor = read_u32(&mut file)?;
        let _godot_patch = read_u32(&mut file)?;
        let _flags = read_u32(&mut file)?;
        let file_base = read_u64(&mut file)?;
        let dir_offset = read_u64(&mut file)?;

        file.seek(SeekFrom::Start(dir_offset))
            .map_err(|error| error.to_string())?;
        let count = read_u32(&mut file)?;

        let mut entries = HashMap::new();
        for _ in 0..count {
            let name_len = read_u32(&mut file)? as usize;
            let mut name_bytes = vec![0_u8; name_len];
            file.read_exact(&mut name_bytes)
                .map_err(|error| error.to_string())?;
            let name = String::from_utf8_lossy(&name_bytes)
                .trim_end_matches('\0')
                .to_string();

            let entry_offset = read_u64(&mut file)?;
            let entry_size = read_u64(&mut file)?;
            file.seek(SeekFrom::Current(20))
                .map_err(|error| error.to_string())?;

            entries.insert(
                name,
                PckEntry {
                    offset: file_base + entry_offset,
                    size: entry_size,
                },
            );
        }

        Ok(Self {
            path: path.to_path_buf(),
            entries,
        })
    }

    fn read_bytes(&self, name: &str) -> AppResult<Vec<u8>> {
        let entry = self
            .entries
            .get(name)
            .ok_or_else(|| format!("missing PCK entry: {}", name))?;
        let mut file = File::open(&self.path).map_err(|error| error.to_string())?;
        file.seek(SeekFrom::Start(entry.offset))
            .map_err(|error| error.to_string())?;
        let mut buffer = vec![0_u8; entry.size as usize];
        file.read_exact(&mut buffer)
            .map_err(|error| error.to_string())?;
        Ok(buffer)
    }

    fn read_text(&self, name: &str) -> AppResult<String> {
        String::from_utf8(self.read_bytes(name)?).map_err(|error| error.to_string())
    }

    fn iter_names(&self) -> impl Iterator<Item = &str> {
        self.entries.keys().map(String::as_str)
    }
}

#[derive(Debug, Clone)]
struct PortraitInfo {
    character: String,
    import_path: String,
    ctex_path: String,
}

fn build_portrait_index(pck: &PckArchive) -> AppResult<HashMap<String, PortraitInfo>> {
    let mut index = HashMap::<String, (PortraitInfo, bool)>::new();

    for name in pck.iter_names() {
        if !name.starts_with("images/packed/card_portraits/") || !name.ends_with(".png.import") {
            continue;
        }

        let parts = name.split('/').collect::<Vec<_>>();
        if parts.len() < 5 {
            continue;
        }

        let character = parts[3].to_string();
        let stem = Path::new(parts.last().copied().unwrap_or_default())
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .trim_end_matches(".png.import")
            .to_string();
        let is_beta = name.contains("/beta/");
        let import_text = pck.read_text(name)?;
        let ctex_path = extract_ctex_path(&import_text).unwrap_or_default();

        let candidate = (
            PortraitInfo {
                character,
                import_path: name.to_string(),
                ctex_path,
            },
            !is_beta,
        );

        match index.get(&stem) {
            Some((_, prefer_base)) if *prefer_base && is_beta => {}
            _ => {
                index.insert(stem, candidate);
            }
        }
    }

    Ok(index
        .into_iter()
        .map(|(key, (value, _))| (key, value))
        .collect())
}

fn extract_ctex_path(import_text: &str) -> Option<String> {
    let marker = "path=\"res://";
    let start = import_text.find(marker)?;
    let rest = &import_text[start + marker.len()..];
    let suffix = ".ctex\"";
    let end = rest.find(suffix)?;
    Some(format!("{}{}", &rest[..end], ".ctex"))
}

#[derive(Clone)]
struct CardTypeInfo {
    name: String,
    inner: CilTypeRc,
}

#[derive(Debug, Clone)]
struct BaseCtorInfo {
    energy: i32,
    type_name: String,
    rarity: String,
    target: String,
    upgradable: bool,
}

#[derive(Debug, Clone)]
struct BuiltVar {
    kind: String,
    key: String,
    value: Option<f64>,
}

#[derive(Debug, Clone)]
struct BuiltUpgrade {
    energy_delta: i32,
    var_deltas: BTreeMap<String, f64>,
    added_keywords: Vec<String>,
    removed_keywords: Vec<String>,
}

impl Default for BuiltUpgrade {
    fn default() -> Self {
        Self {
            energy_delta: 0,
            var_deltas: BTreeMap::new(),
            added_keywords: Vec::new(),
            removed_keywords: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
enum EvalValue {
    SelfRef,
    Int(i32),
    Number(f64),
    String(String),
    Array(Rc<RefCell<Vec<EvalValue>>>),
    Var(BuiltVar),
    FunctionPtr(()),
    Delegate,
    DynamicVars,
    VarKey(String),
    EnergyCost,
    Closure,
    Null,
}

impl EvalValue {
    fn truthy(&self) -> bool {
        match self {
            Self::Null => false,
            Self::Int(value) => *value != 0,
            Self::Number(value) => value.abs() > f64::EPSILON,
            Self::String(value) => !value.is_empty(),
            Self::Array(value) => !value.borrow().is_empty(),
            _ => true,
        }
    }

    fn as_i32(&self) -> Option<i32> {
        match self {
            Self::Int(value) => Some(*value),
            Self::Number(value) => Some(*value as i32),
            _ => None,
        }
    }

    fn as_f64(&self) -> Option<f64> {
        match self {
            Self::Int(value) => Some(f64::from(*value)),
            Self::Number(value) => Some(*value),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ResolvedMethodKind {
    MethodDef,
    MemberRef,
    MethodSpec,
}

#[derive(Debug, Clone)]
struct ResolvedMethodTarget {
    kind: ResolvedMethodKind,
    owner_name: String,
    name: String,
    param_count: usize,
    is_static: bool,
}

struct CardAssemblyParser {
    assembly: CilObject,
    field_by_token: HashMap<u32, FieldRc>,
    field_by_name: HashMap<String, FieldRc>,
}

impl CardAssemblyParser {
    fn new(dll_path: &Path) -> AppResult<Self> {
        let assembly = CilObject::from_path_with_validation(dll_path, ValidationConfig::analysis())
            .map_err(|error| error.to_string())?;
        let mut field_by_token = HashMap::new();
        let mut field_by_name = HashMap::new();

        for type_def in assembly.query_types().defined().iter() {
            for (_, field) in type_def.fields.iter() {
                field_by_token.insert(field.token.value(), field.clone());
                field_by_name.insert(field.name.clone(), field.clone());
            }
        }

        Ok(Self {
            assembly,
            field_by_token,
            field_by_name,
        })
    }

    fn iter_card_types(&self) -> Vec<CardTypeInfo> {
        self.assembly
            .query_types()
            .defined()
            .iter()
            .filter(|item| item.namespace == CARD_NAMESPACE)
            .filter(|item| item.name != "CardModel")
            .filter(|item| !item.name.starts_with("Mock"))
            .filter(|item| item.base().map(|base| base.name == "CardModel").unwrap_or(false))
            .map(|inner| CardTypeInfo {
                name: inner.name.clone(),
                inner,
            })
            .collect()
    }

    fn inspect_class(&self, class_name: &str) -> AppResult<()> {
        let type_def = self
            .iter_card_types()
            .into_iter()
            .find(|item| item.name == class_name)
            .ok_or_else(|| format!("class not found: {}", class_name))?;
        println!("class {}", type_def.name);
        for method_name in [".ctor", "get_CanonicalVars", "get_CanonicalKeywords", "OnUpgrade"] {
            let Some(method) = self.find_method(&type_def, method_name) else {
                println!("missing method {}", method_name);
                continue;
            };
            println!("== {} ==", method_name);
            for instruction in self.collect_instructions(&method)? {
                println!(
                    "rva=0x{:X} {:<16} {}",
                    instruction.rva,
                    instruction.mnemonic,
                    self.describe_operand(&instruction)?
                );
            }
        }
        Ok(())
    }

    fn parse_ctor_fields(&self, type_def: &CardTypeInfo) -> AppResult<HashMap<String, i32>> {
        let Some(method) = self.find_method(type_def, ".ctor") else {
            return Ok(HashMap::new());
        };

        let instructions = self.collect_instructions(&method)?;
        let mut values = HashMap::new();
        let mut index = 0;
        while index + 2 < instructions.len() {
            let first = &instructions[index];
            let second = &instructions[index + 1];
            let third = &instructions[index + 2];

            if first.mnemonic == "ldarg.0" && third.mnemonic == "stfld" && is_ldc_i4(second) {
                let field_name = self.resolve_field_name_from_instruction(third)?;
                let field_value = get_instruction_int(second)?;
                values.insert(field_name, field_value);
                index += 3;
                continue;
            }

            index += 1;
        }

        Ok(values)
    }

    fn build_simple_getters(
        &self,
        type_def: &CardTypeInfo,
        field_values: &HashMap<String, i32>,
    ) -> AppResult<HashMap<String, i32>> {
        let mut getters = HashMap::new();

        for method in self.iter_methods(type_def) {
            if !method.name.starts_with("get_") {
                continue;
            }

            let instructions = self.collect_instructions(&method)?;
            if instructions.len() != 3
                || instructions[0].mnemonic != "ldarg.0"
                || instructions[2].mnemonic != "ret"
            {
                continue;
            }

            let middle = &instructions[1];
            if middle.mnemonic == "ldfld" {
                let field_name = self.resolve_field_name_from_instruction(middle)?;
                if let Some(value) = field_values.get(&field_name) {
                    getters.insert(method.name.clone(), *value);
                }
            } else if is_ldc_i4(middle) {
                getters.insert(method.name.clone(), get_instruction_int(middle)?);
            }
        }

        Ok(getters)
    }

    fn parse_base_ctor_args(&self, type_def: &CardTypeInfo) -> AppResult<BaseCtorInfo> {
        let method = self
            .find_method(type_def, ".ctor")
            .ok_or_else(|| format!("missing .ctor for {}", type_def.name))?;
        let instructions = self.collect_instructions(&method)?;
        let mut stack = Vec::<EvalValue>::new();

        for instruction in &instructions {
            match instruction.mnemonic {
                "ldarg.0" => stack.push(EvalValue::SelfRef),
                value if value.starts_with("ldc.i4") => {
                    stack.push(EvalValue::Int(get_instruction_int(instruction)?))
                }
                "ldstr" | "ldsfld" | "newobj" => stack.push(EvalValue::Null),
                "stfld" => {
                    if stack.len() >= 2 {
                        stack.pop();
                        stack.pop();
                    }
                }
                "call" => {
                    let target = self.resolve_method_target_from_instruction(instruction)?;
                    if target.kind == ResolvedMethodKind::MethodDef
                        && target.owner_name == "CardModel"
                        && target.name == ".ctor"
                        && stack.len() >= 6
                    {
                        let args = &stack[stack.len() - 6..];
                        return Ok(BaseCtorInfo {
                            energy: expect_i32(&args[1], "base ctor energy")?,
                            type_name: card_type_name(expect_i32(&args[2], "base ctor type")?),
                            rarity: card_rarity_name(expect_i32(&args[3], "base ctor rarity")?),
                            target: target_type_name(expect_i32(&args[4], "base ctor target")?),
                            upgradable: expect_i32(&args[5], "base ctor upgradable")? != 0,
                        });
                    }
                    stack.clear();
                }
                _ => {}
            }
        }

        Err(format!(
            "failed to parse CardModel base ctor for {}",
            type_def.name
        ))
    }

    fn eval_get_canonical_vars(
        &self,
        type_def: &CardTypeInfo,
        _simple_fields: &HashMap<String, i32>,
        simple_getters: &HashMap<String, i32>,
    ) -> AppResult<Vec<BuiltVar>> {
        let Some(method) = self.find_method(type_def, "get_CanonicalVars") else {
            return Ok(Vec::new());
        };

        let instructions = self.collect_instructions(&method)?;
        let offset_to_index = instructions
            .iter()
            .enumerate()
            .map(|(index, instruction)| (instruction.rva, index))
            .collect::<HashMap<_, _>>();

        let mut static_fields = HashMap::<String, EvalValue>::new();
        let mut stack = Vec::<EvalValue>::new();
        let mut index = 0;

        while index < instructions.len() {
            let instruction = &instructions[index];
            match instruction.mnemonic {
                "ldarg.0" => stack.push(EvalValue::SelfRef),
                value if value.starts_with("ldc.i4") => {
                    stack.push(EvalValue::Int(get_instruction_int(instruction)?));
                }
                "ldstr" => {
                    stack.push(EvalValue::String(
                        self.resolve_user_string_from_instruction(instruction)?,
                    ));
                }
                "ldsfld" => {
                    let token = instruction_token(instruction)
                        .ok_or_else(|| "ldsfld missing token operand".to_string())?;
                    match token.table() {
                        0x04 => {
                            let field_name = self.resolve_field_name(&token)?;
                            if field_name == "<>9" {
                                stack.push(EvalValue::Closure);
                            } else {
                                stack.push(
                                    static_fields
                                        .get(&field_name)
                                        .cloned()
                                        .unwrap_or(EvalValue::Null),
                                );
                            }
                        }
                        0x0A => {
                            let member_ref = self
                                .assembly
                                .member_ref(&token)
                                .ok_or_else(|| format!("missing member ref 0x{:08X}", token.value()))?;
                            let owner_name = member_ref
                                .declaredby
                                .name()
                                .unwrap_or_else(|| "<unknown>".to_string());
                            match (owner_name.as_str(), member_ref.name.as_str()) {
                                ("Decimal", "One") => stack.push(EvalValue::Number(1.0)),
                                ("Decimal", "Zero") => stack.push(EvalValue::Number(0.0)),
                                ("Decimal", "MinusOne") => stack.push(EvalValue::Number(-1.0)),
                                _ => stack.push(EvalValue::Null),
                            }
                        }
                        _ => stack.push(EvalValue::Null),
                    }
                }
                "newarr" => {
                    let length = pop_i32(&mut stack, "get_CanonicalVars newarr")?;
                    if length < 0 {
                        return Err("negative array size in get_CanonicalVars".to_string());
                    }
                    stack.push(EvalValue::Array(Rc::new(RefCell::new(vec![
                        EvalValue::Null;
                        length as usize
                    ]))));
                }
                "dup" => {
                    let value = stack
                        .last()
                        .cloned()
                        .ok_or_else(|| "dup on empty stack".to_string())?;
                    stack.push(value);
                }
                "stelem.ref" | "stelem.i4" => {
                    let value = pop_value(&mut stack, "get_CanonicalVars stelem")?;
                    let array_index = pop_i32(&mut stack, "get_CanonicalVars stelem index")?;
                    let array = pop_array(&mut stack, "get_CanonicalVars stelem array")?;
                    let slot = usize::try_from(array_index)
                        .map_err(|_| format!("negative array index {}", array_index))?;
                    let mut items = array.borrow_mut();
                    if slot >= items.len() {
                        return Err(format!("array index out of bounds: {}", slot));
                    }
                    items[slot] = value;
                }
                "ldftn" => {
                    let token = instruction_token(instruction)
                        .ok_or_else(|| "ldftn missing token operand".to_string())?;
                    let _ = token;
                    stack.push(EvalValue::FunctionPtr(()));
                }
                "pop" => {
                    stack.pop();
                }
                "brtrue" | "brtrue.s" => {
                    let condition = pop_value(&mut stack, "get_CanonicalVars brtrue")?;
                    if condition.truthy() {
                        let target = instruction_branch_target(instruction)?;
                        index = *offset_to_index
                            .get(&target)
                            .ok_or_else(|| format!("missing branch target 0x{:X}", target))?;
                        continue;
                    }
                }
                "stsfld" => {
                    let field_name = self.resolve_field_name_from_instruction(instruction)?;
                    let value = pop_value(&mut stack, "get_CanonicalVars stsfld")?;
                    static_fields.insert(field_name, value);
                }
                "call" | "callvirt" => {
                    let method_info = self.resolve_method_target_from_instruction(instruction)?;
                    match (method_info.owner_name.as_str(), method_info.name.as_str()) {
                        ("Decimal", "op_Implicit") => {
                            let value = pop_i32(&mut stack, "Decimal::op_Implicit")?;
                            stack.push(EvalValue::Number(f64::from(value)));
                        }
                        ("ExtraDamageVar", "FromOsty") | ("CalculatedDamageVar", "FromOsty") => {
                            let value = pop_value(&mut stack, "FromOsty")?;
                            stack.push(value);
                        }
                        ("CalculatedVar", "WithMultiplier") => {
                            let _delegate = pop_value(&mut stack, "WithMultiplier delegate")?;
                            let value = pop_value(&mut stack, "WithMultiplier value")?;
                            stack.push(value);
                        }
                        _ if method_info.kind == ResolvedMethodKind::MethodDef
                            && method_info.owner_name == type_def.name
                            && simple_getters.contains_key(&method_info.name) =>
                        {
                            if !method_info.is_static && !stack.is_empty() {
                                stack.pop();
                            }
                            let value = simple_getters
                                .get(&method_info.name)
                                .copied()
                                .ok_or_else(|| {
                                    format!(
                                        "missing cached getter {} for {}",
                                        method_info.name, type_def.name
                                    )
                                })?;
                            stack.push(EvalValue::Int(value));
                        }
                        _ => {
                            return Err(format!(
                                "unsupported get_CanonicalVars call {}::{} for {}",
                                method_info.owner_name, method_info.name, type_def.name
                            ));
                        }
                    }
                }
                "newobj" => {
                    let method_info = self.resolve_method_target_from_instruction(instruction)?;
                    match (method_info.owner_name.as_str(), method_info.name.as_str()) {
                        ("Decimal", ".ctor") => {
                            let value = pop_i32(&mut stack, "Decimal::.ctor")?;
                            stack.push(EvalValue::Number(f64::from(value)));
                        }
                        _ if matches!(stack.last(), Some(EvalValue::FunctionPtr(_))) && stack.len() >= 2 =>
                        {
                            let _function =
                                pop_value(&mut stack, "delegate ctor function pointer")?;
                            let _target = pop_value(&mut stack, "delegate ctor target")?;
                            stack.push(EvalValue::Delegate);
                        }
                        (owner_name, _) if is_var_owner_type(owner_name) => {
                            let args = pop_args(&mut stack, method_info.param_count)?;
                            stack.push(EvalValue::Var(build_dynamic_var(owner_name, &args)));
                        }
                        (owner_name, _) if owner_name.contains("ReadOnlyArray") => {
                            let value = pop_value(&mut stack, "ReadOnlyArray ctor")?;
                            stack.push(value);
                        }
                        (owner_name, _) if owner_name.contains("ReadOnlySingleElementList") => {
                            let value =
                                pop_value(&mut stack, "ReadOnlySingleElementList ctor")?;
                            stack.push(EvalValue::Array(Rc::new(RefCell::new(vec![value]))));
                        }
                        ("TypeSpecRow", _) => {
                            if matches!(stack.last(), Some(EvalValue::FunctionPtr(_))) && stack.len() >= 2
                            {
                                let _function =
                                    pop_value(&mut stack, "TypeSpecRow delegate function")?;
                                let _target =
                                    pop_value(&mut stack, "TypeSpecRow delegate target")?;
                                stack.push(EvalValue::Delegate);
                            } else if stack.len() >= 2 {
                                let maybe_value = stack.last().cloned();
                                let maybe_key = stack.get(stack.len() - 2).cloned();
                                if let (Some(value), Some(EvalValue::String(key))) =
                                    (maybe_value, maybe_key)
                                {
                                    let numeric =
                                        expect_f64(&value, "TypeSpecRow dynamic var value")?;
                                    stack.pop();
                                    stack.pop();
                                    stack.push(EvalValue::Var(build_dynamic_var(
                                        "DynamicVar",
                                        &[EvalValue::String(key), EvalValue::Number(numeric)],
                                    )));
                                } else {
                                    let value = pop_value(&mut stack, "TypeSpecRow fallback")?;
                                    stack.push(value);
                                }
                            } else {
                                let value =
                                    pop_value(&mut stack, "TypeSpecRow fallback single")?;
                                stack.push(value);
                            }
                        }
                        _ => {
                            return Err(format!(
                                "unsupported get_CanonicalVars newobj {}::{} for {}",
                                method_info.owner_name, method_info.name, type_def.name
                            ));
                        }
                    }
                }
                "ret" => {
                    let value = stack
                        .pop()
                        .unwrap_or_else(|| EvalValue::Array(Rc::new(RefCell::new(Vec::new()))));
                    return Ok(match value {
                        EvalValue::Var(item) => vec![item],
                        EvalValue::Array(items) => items
                            .borrow()
                            .clone()
                            .into_iter()
                            .filter_map(|item| match item {
                                EvalValue::Var(item) => Some(item),
                                _ => None,
                            })
                            .collect(),
                        _ => Vec::new(),
                    });
                }
                _ => {
                    return Err(format!(
                        "unsupported get_CanonicalVars opcode {} for {}",
                        instruction.mnemonic, type_def.name
                    ));
                }
            }

            index += 1;
        }

        Ok(Vec::new())
    }

    fn parse_keywords(&self, type_def: &CardTypeInfo) -> AppResult<Vec<String>> {
        let Some(method) = self.find_method(type_def, "get_CanonicalKeywords") else {
            return Ok(Vec::new());
        };

        let instructions = self.collect_instructions(&method)?;
        let mut stack = Vec::<EvalValue>::new();

        for instruction in &instructions {
            match instruction.mnemonic {
                value if value.starts_with("ldc.i4") => {
                    stack.push(EvalValue::Int(get_instruction_int(instruction)?));
                }
                "newarr" => {
                    let length = pop_i32(&mut stack, "get_CanonicalKeywords newarr")?;
                    if length < 0 {
                        return Err("negative keyword array size".to_string());
                    }
                    stack.push(EvalValue::Array(Rc::new(RefCell::new(vec![
                        EvalValue::Null;
                        length as usize
                    ]))));
                }
                "dup" => {
                    let value = stack
                        .last()
                        .cloned()
                        .ok_or_else(|| "dup on empty keyword stack".to_string())?;
                    stack.push(value);
                }
                "stelem.i4" => {
                    let value = pop_value(&mut stack, "get_CanonicalKeywords stelem")?;
                    let array_index = pop_i32(&mut stack, "get_CanonicalKeywords index")?;
                    let array = pop_array(&mut stack, "get_CanonicalKeywords array")?;
                    let slot = usize::try_from(array_index)
                        .map_err(|_| format!("negative keyword array index {}", array_index))?;
                    let mut items = array.borrow_mut();
                    if slot >= items.len() {
                        return Err(format!("keyword array index out of bounds: {}", slot));
                    }
                    items[slot] = value;
                }
                "ldtoken" => {
                    let field_name = self.resolve_field_name_from_instruction(instruction)?;
                    stack.push(EvalValue::String(field_name));
                }
                "call" => {
                    let method_info = self.resolve_method_target_from_instruction(instruction)?;
                    if method_info.owner_name == "RuntimeHelpers"
                        && method_info.name == "InitializeArray"
                    {
                        let field_name = pop_string(&mut stack, "InitializeArray field")?;
                        let array = pop_array(&mut stack, "InitializeArray array")?;
                        let len = array.borrow().len();
                        let values = self.read_field_rva_ints(&field_name, len)?;
                        let mut items = array.borrow_mut();
                        for (slot, value) in values.into_iter().enumerate() {
                            items[slot] = EvalValue::Int(value);
                        }
                        drop(items);
                        stack.push(EvalValue::Array(array));
                    } else {
                        return Err(format!(
                            "unsupported keyword call {}::{} for {}",
                            method_info.owner_name, method_info.name, type_def.name
                        ));
                    }
                }
                "newobj" => {
                    let method_info = self.resolve_method_target_from_instruction(instruction)?;
                    if method_info.owner_name == "TypeSpecRow"
                        || method_info.owner_name.contains("ReadOnlyArray")
                    {
                        let value = pop_value(&mut stack, "get_CanonicalKeywords newobj")?;
                        stack.push(value);
                    } else if method_info.owner_name.contains("ReadOnlySingleElementList") {
                        let value = pop_value(
                            &mut stack,
                            "get_CanonicalKeywords ReadOnlySingleElementList",
                        )?;
                        stack.push(EvalValue::Array(Rc::new(RefCell::new(vec![value]))));
                    } else {
                        return Err(format!(
                            "unsupported keyword constructor {} for {}",
                            method_info.owner_name, type_def.name
                        ));
                    }
                }
                "ret" => {
                    let value = stack.pop().unwrap_or(EvalValue::Null);
                    return Ok(normalize_keyword_values(&value));
                }
                _ => {
                    return Err(format!(
                        "unsupported keyword opcode {} for {}",
                        instruction.mnemonic, type_def.name
                    ));
                }
            }
        }

        Ok(Vec::new())
    }

    fn parse_upgrade(&self, type_def: &CardTypeInfo) -> AppResult<BuiltUpgrade> {
        let Some(method) = self.find_method(type_def, "OnUpgrade") else {
            return Ok(BuiltUpgrade::default());
        };

        let instructions = self.collect_instructions(&method)?;
        let mut stack = Vec::<EvalValue>::new();
        let mut upgrade = BuiltUpgrade::default();

        for instruction in &instructions {
            match instruction.mnemonic {
                "ldarg.0" => stack.push(EvalValue::SelfRef),
                value if value.starts_with("ldc.i4") => {
                    stack.push(EvalValue::Int(get_instruction_int(instruction)?));
                }
                "ldstr" => {
                    stack.push(EvalValue::String(
                        self.resolve_user_string_from_instruction(instruction)?,
                    ));
                }
                "ldsfld" => {
                    let token = instruction_token(instruction)
                        .ok_or_else(|| "upgrade ldsfld missing token".to_string())?;
                    if token.table() != 0x0A {
                        return Err(format!(
                            "unsupported upgrade field token table {} for {}",
                            token.table(),
                            type_def.name
                        ));
                    }
                    let member_ref = self
                        .assembly
                        .member_ref(&token)
                        .ok_or_else(|| format!("missing member ref 0x{:08X}", token.value()))?;
                    let owner_name = member_ref
                        .declaredby
                        .name()
                        .unwrap_or_else(|| "<unknown>".to_string());
                    match (owner_name.as_str(), member_ref.name.as_str()) {
                        ("Decimal", "One") => stack.push(EvalValue::Number(1.0)),
                        ("Decimal", "MinusOne") => stack.push(EvalValue::Number(-1.0)),
                        _ => {
                            return Err(format!(
                                "unsupported upgrade field {}::{} for {}",
                                owner_name, member_ref.name, type_def.name
                            ));
                        }
                    }
                }
                "newobj" => {
                    let method_info = self.resolve_method_target_from_instruction(instruction)?;
                    if method_info.owner_name == "Decimal" && method_info.name == ".ctor" {
                        let value = pop_i32(&mut stack, "upgrade Decimal ctor")?;
                        stack.push(EvalValue::Number(f64::from(value)));
                    } else {
                        return Err(format!(
                            "unsupported upgrade constructor {}::{} for {}",
                            method_info.owner_name, method_info.name, type_def.name
                        ));
                    }
                }
                "call" | "callvirt" => {
                    let method_info = self.resolve_method_target_from_instruction(instruction)?;
                    match (method_info.owner_name.as_str(), method_info.name.as_str()) {
                        ("CardModel", "get_DynamicVars") => {
                            pop_value(&mut stack, "CardModel::get_DynamicVars")?;
                            stack.push(EvalValue::DynamicVars);
                        }
                        ("DynamicVarSet", name) if name.starts_with("get_") => {
                            if name == "get_Item" {
                                let key = pop_string(&mut stack, "DynamicVarSet::get_Item key")?;
                                pop_value(&mut stack, "DynamicVarSet::get_Item set")?;
                                stack.push(EvalValue::VarKey(key));
                            } else {
                                pop_value(&mut stack, "DynamicVarSet getter set")?;
                                stack.push(EvalValue::VarKey(
                                    name.trim_start_matches("get_").to_string(),
                                ));
                            }
                        }
                        ("DynamicVar", "UpgradeValueBy") => {
                            let delta = pop_f64(&mut stack, "DynamicVar::UpgradeValueBy delta")?;
                            let key = pop_var_key(&mut stack, "DynamicVar::UpgradeValueBy ref")?;
                            upgrade.var_deltas.insert(key, delta);
                        }
                        ("CardModel", "get_EnergyCost") => {
                            pop_value(&mut stack, "CardModel::get_EnergyCost")?;
                            stack.push(EvalValue::EnergyCost);
                        }
                        ("CardEnergyCost", "UpgradeBy") => {
                            let delta = pop_f64(&mut stack, "CardEnergyCost::UpgradeBy delta")?;
                            pop_value(&mut stack, "CardEnergyCost::UpgradeBy cost")?;
                            upgrade.energy_delta = delta as i32;
                        }
                        ("CardModel", "AddKeyword") => {
                            let value = pop_i32(&mut stack, "CardModel::AddKeyword keyword")?;
                            pop_value(&mut stack, "CardModel::AddKeyword self")?;
                            if let Some(keyword) = keyword_name(value) {
                                upgrade.added_keywords.push(keyword.to_string());
                            }
                        }
                        ("CardModel", "RemoveKeyword") => {
                            let value = pop_i32(&mut stack, "CardModel::RemoveKeyword keyword")?;
                            pop_value(&mut stack, "CardModel::RemoveKeyword self")?;
                            if let Some(keyword) = keyword_name(value) {
                                upgrade.removed_keywords.push(keyword.to_string());
                            }
                        }
                        _ => {
                            return Err(format!(
                                "unsupported upgrade call {}::{} for {}",
                                method_info.owner_name, method_info.name, type_def.name
                            ));
                        }
                    }
                }
                "ret" => {
                    return Ok(upgrade);
                }
                _ => {
                    return Err(format!(
                        "unsupported upgrade opcode {} for {}",
                        instruction.mnemonic, type_def.name
                    ));
                }
            }
        }

        Ok(upgrade)
    }

    fn find_method(&self, type_def: &CardTypeInfo, name: &str) -> Option<MethodRc> {
        self.iter_methods(type_def)
            .into_iter()
            .find(|method| method.name == name)
    }

    fn iter_methods(&self, type_def: &CardTypeInfo) -> Vec<MethodRc> {
        type_def
            .inner
            .methods
            .iter()
            .filter_map(|(_, item)| item.upgrade())
            .collect()
    }

    fn collect_instructions(&self, method: &MethodRc) -> AppResult<Vec<Instruction>> {
        let instructions = method.instructions().cloned().collect::<Vec<_>>();
        if !instructions.is_empty() {
            return Ok(instructions);
        }

        let body = method
            .body
            .get()
            .ok_or_else(|| format!("method {} has no body", method.name))?;
        if body.size_code == 0 {
            return Ok(Vec::new());
        }

        let method_rva = method
            .rva
            .ok_or_else(|| format!("method {} missing RVA", method.name))?;
        let code_rva = method_rva as usize + body.size_header;
        let code_offset = self
            .assembly
            .file()
            .rva_to_offset(code_rva)
            .map_err(|error| error.to_string())?;
        let blocks = decode_blocks(
            self.assembly.file().data(),
            code_offset,
            code_rva,
            Some(body.size_code),
        )
        .map_err(|error| error.to_string())?;

        Ok(blocks
            .into_iter()
            .flat_map(|block| block.instructions.into_iter())
            .collect())
    }

    fn resolve_method_target_from_instruction(
        &self,
        instruction: &Instruction,
    ) -> AppResult<ResolvedMethodTarget> {
        let token = instruction_token(instruction)
            .ok_or_else(|| format!("{} missing method token", instruction.mnemonic))?;
        self.resolve_method_target(&token)
    }

    fn resolve_method_target(&self, token: &Token) -> AppResult<ResolvedMethodTarget> {
        match token.table() {
            0x06 => {
                let method = self
                    .assembly
                    .method(token)
                    .ok_or_else(|| format!("missing method 0x{:08X}", token.value()))?;
                let owner_name = method
                    .declaring_type
                    .get()
                    .and_then(|item| item.upgrade())
                    .map(|item| item.name.clone())
                    .unwrap_or_else(|| "<unknown>".to_string());
                Ok(ResolvedMethodTarget {
                    kind: ResolvedMethodKind::MethodDef,
                    owner_name: sanitize_owner_name(&owner_name),
                    name: method.name.clone(),
                    param_count: method.signature.params.len(),
                    is_static: method.is_static(),
                })
            }
            0x0A => {
                let member_ref = self
                    .assembly
                    .member_ref(token)
                    .ok_or_else(|| format!("missing member ref 0x{:08X}", token.value()))?;
                let param_count = match &member_ref.signature {
                    MemberRefSignature::Method(signature) => signature.params.len(),
                    MemberRefSignature::Field(_) => 0,
                };
                let owner_name = member_ref
                    .declaredby
                    .name()
                    .unwrap_or_else(|| "<unknown>".to_string());
                Ok(ResolvedMethodTarget {
                    kind: ResolvedMethodKind::MemberRef,
                    owner_name: sanitize_owner_name(&owner_name),
                    name: member_ref.name.clone(),
                    param_count,
                    is_static: false,
                })
            }
            0x2B => {
                let spec = self
                    .assembly
                    .method_spec(token)
                    .ok_or_else(|| format!("missing method spec 0x{:08X}", token.value()))?;
                let mut resolved = self.resolve_method_reference(&spec.method)?;
                resolved.kind = ResolvedMethodKind::MethodSpec;
                Ok(resolved)
            }
            other => Err(format!(
                "unsupported method token table {} for 0x{:08X}",
                other,
                token.value()
            )),
        }
    }

    fn resolve_method_reference(
        &self,
        reference: &CilTypeReference,
    ) -> AppResult<ResolvedMethodTarget> {
        match reference {
            CilTypeReference::MethodDef(method_ref) => {
                let method = method_ref
                    .upgrade()
                    .ok_or_else(|| "dangling MethodDef reference".to_string())?;
                let owner_name = method
                    .declaring_type
                    .get()
                    .and_then(|item| item.upgrade())
                    .map(|item| item.name.clone())
                    .unwrap_or_else(|| "<unknown>".to_string());
                Ok(ResolvedMethodTarget {
                    kind: ResolvedMethodKind::MethodDef,
                    owner_name: sanitize_owner_name(&owner_name),
                    name: method.name.clone(),
                    param_count: method.signature.params.len(),
                    is_static: method.is_static(),
                })
            }
            CilTypeReference::MemberRef(member_ref) => {
                let param_count = match &member_ref.signature {
                    MemberRefSignature::Method(signature) => signature.params.len(),
                    MemberRefSignature::Field(_) => 0,
                };
                let owner_name = member_ref
                    .declaredby
                    .name()
                    .unwrap_or_else(|| "<unknown>".to_string());
                Ok(ResolvedMethodTarget {
                    kind: ResolvedMethodKind::MemberRef,
                    owner_name: sanitize_owner_name(&owner_name),
                    name: member_ref.name.clone(),
                    param_count,
                    is_static: false,
                })
            }
            other => Err(format!(
                "unsupported method reference {:?}",
                other.token().map(|item| item.value())
            )),
        }
    }

    fn resolve_field_name_from_instruction(&self, instruction: &Instruction) -> AppResult<String> {
        let token = instruction_token(instruction)
            .ok_or_else(|| format!("{} missing field token", instruction.mnemonic))?;
        self.resolve_field_name(&token)
    }

    fn resolve_field_name(&self, token: &Token) -> AppResult<String> {
        match token.table() {
            0x04 => self
                .field_by_token
                .get(&token.value())
                .map(|item| item.name.clone())
                .ok_or_else(|| format!("missing field 0x{:08X}", token.value())),
            0x0A => self
                .assembly
                .member_ref(token)
                .map(|item| item.name.clone())
                .ok_or_else(|| format!("missing member ref 0x{:08X}", token.value())),
            other => Err(format!(
                "unsupported field token table {} for 0x{:08X}",
                other,
                token.value()
            )),
        }
    }

    fn resolve_user_string_from_instruction(&self, instruction: &Instruction) -> AppResult<String> {
        let token = instruction_token(instruction)
            .ok_or_else(|| format!("{} missing string token", instruction.mnemonic))?;
        if token.table() != 0x70 {
            return Err(format!(
                "instruction {} did not reference a user string: 0x{:08X}",
                instruction.mnemonic,
                token.value()
            ));
        }

        let index = (token.value() & 0x00FF_FFFF) as usize;
        let heap = self
            .assembly
            .userstrings()
            .ok_or_else(|| "assembly missing #US heap".to_string())?;
        heap.get(index)
            .map(|value| value.to_string_lossy())
            .map_err(|error| error.to_string())
    }

    fn read_field_rva_ints(&self, field_name: &str, count: usize) -> AppResult<Vec<i32>> {
        let Some(field) = self.field_by_name.get(field_name) else {
            return Ok(Vec::new());
        };
        let Some(rva) = field.rva.get().copied() else {
            return Ok(Vec::new());
        };

        let offset = self
            .assembly
            .file()
            .rva_to_offset(rva as usize)
            .map_err(|error| error.to_string())?;
        let data = self.assembly.file().data();
        let byte_len = count
            .checked_mul(4)
            .ok_or_else(|| "field RVA size overflow".to_string())?;
        if offset + byte_len > data.len() {
            return Err(format!(
                "field RVA {} out of bounds: offset={} len={}",
                field_name, offset, byte_len
            ));
        }

        let mut result = Vec::with_capacity(count);
        for chunk in data[offset..offset + byte_len].chunks_exact(4) {
            let value = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
            result.push(i32::try_from(value).map_err(|_| {
                format!("field RVA {} contained non-i32 value {}", field_name, value)
            })?);
        }
        Ok(result)
    }

    fn describe_operand(&self, instruction: &Instruction) -> AppResult<String> {
        match instruction_token(instruction) {
            Some(token) => match token.table() {
                0x04 | 0x0A => {
                    if instruction.mnemonic.contains("fld") || instruction.mnemonic == "ldtoken" {
                        Ok(format!(
                            "{} ({})",
                            operand_debug(&instruction.operand),
                            self.resolve_field_name(&token)?
                        ))
                    } else if matches!(instruction.mnemonic, "call" | "callvirt" | "newobj" | "ldftn")
                    {
                        let method = self.resolve_method_target(&token)?;
                        Ok(format!(
                            "{} ({}::{} / params={})",
                            operand_debug(&instruction.operand),
                            method.owner_name,
                            method.name,
                            method.param_count
                        ))
                    } else {
                        Ok(operand_debug(&instruction.operand))
                    }
                }
                0x06 | 0x2B => {
                    let method = self.resolve_method_target(&token)?;
                    Ok(format!(
                        "{} ({}::{} / params={})",
                        operand_debug(&instruction.operand),
                        method.owner_name,
                        method.name,
                        method.param_count
                    ))
                }
                0x70 => Ok(format!(
                    "{} ({})",
                    operand_debug(&instruction.operand),
                    self.resolve_user_string_from_instruction(instruction)?
                )),
                _ => Ok(operand_debug(&instruction.operand)),
            },
            None => Ok(operand_debug(&instruction.operand)),
        }
    }
}

fn instruction_token(instruction: &Instruction) -> Option<Token> {
    match instruction.operand {
        Operand::Token(token) => Some(token),
        _ => None,
    }
}

fn instruction_branch_target(instruction: &Instruction) -> AppResult<u64> {
    match instruction.operand {
        Operand::Target(target) => Ok(target),
        _ => instruction
            .branch_targets
            .first()
            .copied()
            .ok_or_else(|| format!("{} missing branch target", instruction.mnemonic)),
    }
}

fn is_ldc_i4(instruction: &Instruction) -> bool {
    instruction.mnemonic.starts_with("ldc.i4")
}

fn get_instruction_int(instruction: &Instruction) -> AppResult<i32> {
    match instruction.mnemonic {
        "ldc.i4.m1" => Ok(-1),
        "ldc.i4.0" => Ok(0),
        "ldc.i4.1" => Ok(1),
        "ldc.i4.2" => Ok(2),
        "ldc.i4.3" => Ok(3),
        "ldc.i4.4" => Ok(4),
        "ldc.i4.5" => Ok(5),
        "ldc.i4.6" => Ok(6),
        "ldc.i4.7" => Ok(7),
        "ldc.i4.8" => Ok(8),
        "ldc.i4" | "ldc.i4.s" => match instruction.operand {
            Operand::Immediate(Immediate::Int8(value)) => Ok(i32::from(value)),
            Operand::Immediate(Immediate::UInt8(value)) => Ok(i32::from(value)),
            Operand::Immediate(Immediate::Int16(value)) => Ok(i32::from(value)),
            Operand::Immediate(Immediate::UInt16(value)) => Ok(i32::from(value)),
            Operand::Immediate(Immediate::Int32(value)) => Ok(value),
            Operand::Immediate(Immediate::UInt32(value)) => {
                i32::try_from(value).map_err(|_| format!("ldc.i4 value too large: {}", value))
            }
            _ => Err(format!(
                "unsupported ldc immediate {}",
                operand_debug(&instruction.operand)
            )),
        },
        other => Err(format!("unsupported integer opcode {}", other)),
    }
}

fn operand_debug(operand: &Operand) -> String {
    match operand {
        Operand::None => "none".to_string(),
        Operand::Immediate(value) => format!("{value:?}"),
        Operand::Target(value) => format!("target:{value}"),
        Operand::Token(value) => format!("token:0x{:08X}", value.value()),
        Operand::Local(value) => format!("local:{value}"),
        Operand::Argument(value) => format!("arg:{value}"),
        Operand::Switch(value) => format!("switch:{:?}", value),
    }
}

fn pop_value(stack: &mut Vec<EvalValue>, context: &str) -> AppResult<EvalValue> {
    stack
        .pop()
        .ok_or_else(|| format!("stack underflow in {}", context))
}

fn pop_i32(stack: &mut Vec<EvalValue>, context: &str) -> AppResult<i32> {
    let value = pop_value(stack, context)?;
    expect_i32(&value, context)
}

fn pop_f64(stack: &mut Vec<EvalValue>, context: &str) -> AppResult<f64> {
    let value = pop_value(stack, context)?;
    expect_f64(&value, context)
}

fn pop_string(stack: &mut Vec<EvalValue>, context: &str) -> AppResult<String> {
    match pop_value(stack, context)? {
        EvalValue::String(value) => Ok(value),
        other => Err(format!("expected string in {} but found {:?}", context, other)),
    }
}

fn pop_array(
    stack: &mut Vec<EvalValue>,
    context: &str,
) -> AppResult<Rc<RefCell<Vec<EvalValue>>>> {
    match pop_value(stack, context)? {
        EvalValue::Array(value) => Ok(value),
        other => Err(format!("expected array in {} but found {:?}", context, other)),
    }
}

fn pop_var_key(stack: &mut Vec<EvalValue>, context: &str) -> AppResult<String> {
    match pop_value(stack, context)? {
        EvalValue::VarKey(value) => Ok(value),
        other => Err(format!("expected var key in {} but found {:?}", context, other)),
    }
}

fn pop_args(stack: &mut Vec<EvalValue>, count: usize) -> AppResult<Vec<EvalValue>> {
    if stack.len() < count {
        return Err(format!(
            "stack underflow while popping {} args from size {}",
            count,
            stack.len()
        ));
    }
    let mut values = Vec::with_capacity(count);
    for _ in 0..count {
        values.push(stack.pop().expect("checked stack length"));
    }
    values.reverse();
    Ok(values)
}

fn expect_i32(value: &EvalValue, context: &str) -> AppResult<i32> {
    value
        .as_i32()
        .ok_or_else(|| format!("expected i32 in {} but found {:?}", context, value))
}

fn expect_f64(value: &EvalValue, context: &str) -> AppResult<f64> {
    value
        .as_f64()
        .ok_or_else(|| format!("expected number in {} but found {:?}", context, value))
}

fn is_var_owner_type(owner_name: &str) -> bool {
    let owner_name = sanitize_owner_name(owner_name);
    owner_name.ends_with("Var")
        || matches!(
            owner_name.as_str(),
        "DamageVar"
            | "CardsVar"
            | "BlockVar"
            | "DynamicVar"
            | "EnergyVar"
            | "CalculationBaseVar"
            | "CalculationExtraVar"
            | "RepeatVar"
            | "ExtraDamageVar"
            | "CalculatedDamageVar"
            | "CalculatedVar"
            | "StarsVar"
            | "SummonVar"
            | "HpLossVar"
            | "ForgeVar"
            | "OstyDamageVar"
            | "CalculatedBlockVar"
            | "IntVar"
            | "GoldVar"
            | "MaxHpVar"
            | "HealVar"
        )
}

fn build_dynamic_var(owner_name: &str, args: &[EvalValue]) -> BuiltVar {
    let owner_name = sanitize_owner_name(owner_name);
    let key = normalize_var_key(&owner_name, args);
    let value = args.iter().find_map(EvalValue::as_f64);
    BuiltVar {
        kind: owner_name.trim_end_matches("Var").to_string(),
        key,
        value,
    }
}

fn normalize_var_key(owner_name: &str, args: &[EvalValue]) -> String {
    let owner_name = sanitize_owner_name(owner_name);
    if matches!(owner_name.as_str(), "DynamicVar" | "IntVar" | "CalculatedVar") {
        if let Some(EvalValue::String(value)) = args.first() {
            return value.clone();
        }
    }

    if let Some(EvalValue::String(value)) = args.first() {
        return value.clone();
    }

    owner_name.trim_end_matches("Var").to_string()
}

fn sanitize_owner_name(owner_name: &str) -> String {
    owner_name
        .split('`')
        .next()
        .unwrap_or(owner_name)
        .to_string()
}

fn normalize_keyword_values(value: &EvalValue) -> Vec<String> {
    match value {
        EvalValue::Array(items) => items
            .borrow()
            .iter()
            .filter_map(EvalValue::as_i32)
            .filter_map(keyword_name)
            .map(str::to_string)
            .collect(),
        EvalValue::Int(item) => keyword_name(*item).map(str::to_string).into_iter().collect(),
        EvalValue::Number(item) => keyword_name(*item as i32)
            .map(str::to_string)
            .into_iter()
            .collect(),
        _ => Vec::new(),
    }
}

fn choose_art_stem(class_name: &str, card_type: &str) -> String {
    if class_name == "MadScience" {
        return format!("mad_science_{}", card_type);
    }
    pascal_to_snake(class_name)
}

fn pascal_to_snake(value: &str) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    let mut output = String::new();

    for (index, ch) in chars.iter().enumerate() {
        let prev = index.checked_sub(1).and_then(|item| chars.get(item)).copied();
        let next = chars.get(index + 1).copied();
        if ch.is_ascii_uppercase()
            && index > 0
            && (prev.map(|item| item.is_ascii_lowercase() || item.is_ascii_digit()).unwrap_or(false)
                || next.map(|item| item.is_ascii_lowercase()).unwrap_or(false))
        {
            output.push('_');
        }
        output.push(ch.to_ascii_lowercase());
    }

    output
}

fn card_type_name(value: i32) -> String {
    match value {
        1 => "attack",
        2 => "skill",
        3 => "power",
        4 => "status",
        5 => "curse",
        6 => "quest",
        _ => "none",
    }
    .to_string()
}

fn card_rarity_name(value: i32) -> String {
    match value {
        1 => "basic",
        2 => "common",
        3 => "uncommon",
        4 => "rare",
        5 => "ancient",
        6 => "event",
        7 => "token",
        8 => "status",
        9 => "curse",
        10 => "quest",
        _ => "none",
    }
    .to_string()
}

fn target_type_name(value: i32) -> String {
    match value {
        1 => "self",
        2 => "any_enemy",
        3 => "all_enemies",
        4 => "random_enemy",
        5 => "any_player",
        6 => "any_ally",
        7 => "all_allies",
        8 => "targeted_no_creature",
        9 => "osty",
        _ => "none",
    }
    .to_string()
}

fn keyword_name(value: i32) -> Option<&'static str> {
    match value {
        1 => Some("EXHAUST"),
        2 => Some("ETHEREAL"),
        3 => Some("INNATE"),
        4 => Some("UNPLAYABLE"),
        5 => Some("RETAIN"),
        6 => Some("SLY"),
        7 => Some("ETERNAL"),
        _ => None,
    }
}

fn read_u32(file: &mut File) -> AppResult<u32> {
    let mut buffer = [0_u8; 4];
    file.read_exact(&mut buffer)
        .map_err(|error| error.to_string())?;
    Ok(u32::from_le_bytes(buffer))
}

fn read_u64(file: &mut File) -> AppResult<u64> {
    let mut buffer = [0_u8; 8];
    file.read_exact(&mut buffer)
        .map_err(|error| error.to_string())?;
    Ok(u64::from_le_bytes(buffer))
}

#[derive(Debug, Clone)]
enum SnapshotNumber {
    Int(i64),
    Float(f64),
}

impl Serialize for SnapshotNumber {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Int(value) => serializer.serialize_i64(*value),
            Self::Float(value) => serializer.serialize_f64(*value),
        }
    }
}

fn snapshot_number(value: f64) -> SnapshotNumber {
    if value.fract().abs() < 1e-9 {
        SnapshotNumber::Int(value as i64)
    } else {
        SnapshotNumber::Float(value)
    }
}

#[derive(Debug, Serialize)]
struct SnapshotFile {
    version: String,
    commit: Option<String>,
    generated_at: String,
    card_count: usize,
    missing_art_ids: Vec<String>,
    cards: Vec<SnapshotCard>,
}

#[derive(Debug, Serialize)]
struct SnapshotCard {
    id: String,
    class_name: String,
    energy: i32,
    #[serde(rename = "type")]
    type_name: String,
    rarity: String,
    target: String,
    upgradable: bool,
    vars: Vec<SerializableVar>,
    keywords: Vec<String>,
    upgrade: SerializableUpgrade,
    character: Option<String>,
    art_stem: String,
    art_import_path: Option<String>,
    art_ctex_path: Option<String>,
}

#[derive(Debug, Serialize)]
struct SerializableVar {
    kind: String,
    key: String,
    value: Option<SnapshotNumber>,
}

impl From<BuiltVar> for SerializableVar {
    fn from(value: BuiltVar) -> Self {
        Self {
            kind: value.kind,
            key: value.key,
            value: value.value.map(snapshot_number),
        }
    }
}

#[derive(Debug, Serialize)]
struct SerializableUpgrade {
    energy_delta: i32,
    var_deltas: BTreeMap<String, SnapshotNumber>,
    added_keywords: Vec<String>,
    removed_keywords: Vec<String>,
}

impl From<BuiltUpgrade> for SerializableUpgrade {
    fn from(value: BuiltUpgrade) -> Self {
        Self {
            energy_delta: value.energy_delta,
            var_deltas: value
                .var_deltas
                .into_iter()
                .map(|(key, number)| (key, snapshot_number(number)))
                .collect(),
            added_keywords: value.added_keywords,
            removed_keywords: value.removed_keywords,
        }
    }
}
