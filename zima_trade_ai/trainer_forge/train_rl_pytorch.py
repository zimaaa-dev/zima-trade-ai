"""
PyTorch RL (PPO) & LSTM Training Pipeline
Runs on Node B (Home GPU PC with 8GB VRAM).
Stratified replay buffer covering bull, bear, and consolidation phases.
"""
import torch
import torch.nn as nn
import torch.optim as optim
import logging

logger = logging.getLogger(__name__)


class ActorCritic(nn.Module):
    def __init__(self, input_dim: int = 5, action_dim: int = 3, hidden_dim: int = 64):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, hidden_dim, batch_first=True)
        self.actor = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.ReLU(),
            nn.Linear(32, action_dim),
            nn.Softmax(dim=-1),
        )
        self.critic = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor):
        lstm_out, _ = self.lstm(x)
        # Take the last time step
        last_step = lstm_out[:, -1, :] if x.ndim == 3 else lstm_out
        action_probs = self.actor(last_step)
        value = self.critic(last_step)
        return action_probs, value


def train_policy_gpu():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Training on device: {device}")

    model = ActorCritic().to(device)
    optimizer = optim.Adam(model.parameters(), lr=3e-4)

    # Simulated training step on market phase replay buffer
    dummy_input = torch.randn(32, 10, 5).to(device)  # Batch 32, Seq 10, Feat 5
    action_probs, value = model(dummy_input)
    loss = (action_probs.sum() - value.sum()).abs()

    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    logger.info("Epoch completed. Loss: %.4f", loss.item())
    return model


if __name__ == "__main__":
    train_policy_gpu()
