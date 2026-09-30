/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: { colors: { blue: {50:'#F2F3F5',100:'#E8EBF1',200:'#CBD2DF',300:'#A7B5CC',400:'#7184A4',500:'#526784',600:'#293A61',700:'#223151',800:'#1C2B49',900:'#17243D'}, amber:{50:'#FBF7EF',100:'#F5EAD5',200:'#EAD0A3',300:'#E1BC83',400:'#D5A65A',500:'#B8873E',600:'#986F32',700:'#805D2A',800:'#654A23',900:'#503B1D'} } },
  },
  plugins: [],
}