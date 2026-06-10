#![cfg_attr(not(feature = "abi-gen"), no_main, no_std)]

// Lite leaderboard: points-only, no IPFS-CID history, no custom errors.
// Kept deliberately tiny (target <10KB PolkaVM) — registration + a running
// score per player. All methods are infallible/idempotent and only use
// fixed-size types, so the contract is built in no-alloc / stack-buffer mode
// (`buffer = N`) instead of pulling in the allocator-backed codec.

// A minimal global allocator must still be present for the runtime, but the
// stack-buffer encoder means it is effectively unused on the on-chain build.
#[cfg(not(feature = "abi-gen"))]
#[global_allocator]
static mut ALLOC: picoalloc::Mutex<picoalloc::Allocator<picoalloc::ArrayPointer<256>>> = {
    static mut ARRAY: picoalloc::Array<256> = picoalloc::Array([0u8; 256]);
    picoalloc::Mutex::new(picoalloc::Allocator::new(unsafe {
        picoalloc::ArrayPointer::new(&raw mut ARRAY)
    }))
};

#[pvm_contract_sdk::contract(buffer = 256)]
mod leaderboard {
    use pvm_contract_sdk::{Address, HostApi, Lazy, Mapping};

    pub struct Leaderboard {
        #[slot(0)]
        player_count: Lazy<u64>,
        #[slot(1)]
        player_at: Mapping<u64, [u8; 20]>,
        #[slot(2)]
        is_registered: Mapping<[u8; 20], bool>,
        #[slot(3)]
        player_points: Mapping<[u8; 20], i64>,
    }

    impl Leaderboard {
        #[pvm_contract_sdk::constructor]
        pub fn new(&mut self) {
            self.player_count.set(&0);
        }

        /// Register the caller. Idempotent: calling again is a no-op.
        #[pvm_contract_sdk::method]
        pub fn register(&mut self) {
            let caller = self.caller();
            if self.is_registered.get(&caller.0) {
                return;
            }
            let idx = self.player_count.get();
            self.player_at.insert(&idx, &caller.0);
            self.is_registered.insert(&caller.0, &true);
            self.player_points.insert(&caller.0, &0);
            self.player_count.set(&(idx + 1));
        }

        /// Add (or subtract) points for the caller.
        #[pvm_contract_sdk::method]
        pub fn add_points(&mut self, points_delta: i64) {
            let caller = self.caller();
            let current = self.player_points.get(&caller.0);
            self.player_points.insert(&caller.0, &(current + points_delta));
        }

        #[pvm_contract_sdk::method]
        pub fn get_player_count(&self) -> u64 {
            self.player_count.get()
        }

        /// Address at `index`. Returns the zero address if out of range.
        #[pvm_contract_sdk::method]
        pub fn get_player_at(&self, index: u64) -> Address {
            Address(self.player_at.get(&index))
        }

        #[pvm_contract_sdk::method]
        pub fn get_player_points(&self, player: Address) -> i64 {
            self.player_points.get(&player.0)
        }

        #[pvm_contract_sdk::method]
        pub fn is_registered(&self, player: Address) -> bool {
            self.is_registered.get(&player.0)
        }

        fn caller(&self) -> Address {
            let mut buf = [0u8; 20];
            self.host().caller(&mut buf);
            Address(buf)
        }
    }
}
