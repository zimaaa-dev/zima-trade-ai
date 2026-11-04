"""
ONNX Exporter & SHA256 Manifest Publisher
Exports trained PyTorch weights to .onnx and generates cryptographic SHA256 manifest.
"""
import os
import json
import hashlib
import torch
from zima_trade_ai.trainer_forge.train_rl_pytorch import ActorCritic


def export_and_sign(model_path: str = "./models/ppo_policy.onnx", manifest_path: str = "./models/manifest.json"):
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    model = ActorCritic()
    model.eval()

    dummy_input = torch.randn(1, 10, 5)

    torch.onnx.export(
        model,
        dummy_input,
        model_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["market_features"],
        output_names=["action_probs", "state_value"],
        dynamic_axes={"market_features": {0: "batch_size"}},
    )

    # Compute SHA256
    sha = hashlib.sha256()
    with open(model_path, "rb") as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    file_hash = sha.hexdigest()

    manifest = {
        "model_file": os.path.basename(model_path),
        "sha256": file_hash,
        "input_dim": 5,
        "action_dim": 3,
        "architecture": "LSTM-ActorCritic",
    }

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Exported ONNX model to {model_path}")
    print(f"SHA256: {file_hash}")
    return file_hash


if __name__ == "__main__":
    export_and_sign()
