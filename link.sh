

if [ -z "$1" ]
then
  echo "Nothing to link to for core.  You can use './link.sh reset', though, to reinstall all packages"
elif [ "$1" == "reset" ]
then
  rm -rf ./node_modules || exit
  npm i || exit
fi
