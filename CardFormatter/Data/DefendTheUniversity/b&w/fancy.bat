convert %1 -canny "0x1+10%+30%" -negate PNG32:tmp1.png
convert %1 -colorize "50%" tmp2.png
convert tmp2.png tmp1.png -compose dissolve -define compose:args=50 -gravity South -composite PNG32:%1.png
del tmp2.png tmp1.png -A