import { utils } from 'ethers'

const IERC20_ABI = [
  'function name() view returns (string name)',
  'function symbol() view returns (string symbol)',
  'function decimals() view returns (uint8 decimals)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address recipient, uint256 amount) public returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) public returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint amount)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]

export const ierc20Interface = new utils.Interface(IERC20_ABI)
