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

var later = node.createChild('later')
later.icons.add('list')

var done = node.createChild(-1)
done.icons.add('button_ok')
done.text = 'done'
done.setLeft(true)

var main = node.createChild(-1)
main.icons.clear()
main.text = 'main'
main.setLeft(true)
main.link.text = '../../../main.mm'
