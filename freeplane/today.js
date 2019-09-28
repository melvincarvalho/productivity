var d = new Date()
var date = d.getDate()
if (date < 10) {
  date = '0' + date
}
var month = d.getMonth() + 1
if (month < 10) {
  month = '0' + month
}
var year = d.getFullYear()
node.text = date + '/' + month + '/' + year
node.link.text = '../index.mm'
node.icons.clear()
node.icons.add('calendar')

var todo = node.createChild('todo')
todo.icons.add('idea')

var done = node.createChild(-1)
done.icons.add('button_ok')
done.text = 'done'
done.setLeft(true)

var later = node.createChild('later')
later.icons.add('list')
later.setLeft(true)

var links = node.createChild(-1)
links.icons.clear()
links.text = 'links'
links.setLeft(true)

var main = links.createChild(-1)
main.icons.clear()
main.text = 'main'
main.setLeft(true)
main.link.text = '../../../main.mm'

var tmp = links.createChild(-1)
tmp.icons.clear()
tmp.text = 'tmp'
tmp.setLeft(true)
tmp.link.text = '../../../tmp.mm'

var scratch = links.createChild(-1)
scratch.icons.clear()
scratch.text = 'scratch'
scratch.setLeft(true)
scratch.link.text = '../../../scratch.mm'

var prev = links.createChild(-1)
prev.icons.clear()
prev.text = 'prev'
prev.setLeft(true)
prev.link.text = '../' + (date - 1) + '/index.mm'

var next = links.createChild(-1)
next.icons.clear()
next.text = 'next'
next.setLeft(true)
next.link.text = '../' + (date + 1) + '/index.mm'
